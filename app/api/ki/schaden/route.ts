/* Schadenprüfung für EINE Police (KI). Beschreibung und Seiten wurden auf dem Gerät gegen die Schwärzliste ersetzt.
   Schadenfotos gehen nie hierher. Ablauf wie /api/ki/frage: Anmeldung → Mitgliedschaft (RLS) → Prüfen → Klartext-Sperre → Limit → KI → Protokoll ohne Inhalt. */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { anbieterAus, KiFehler } from "@/lib/ki/anbieter";
import { jsonAus, klartextVerdacht } from "@/lib/ki/antwort";
import { schadenPrompt, type PoliceEingabe, type SchadenEingabe } from "@/lib/ki/schaden";
import { MAX_SEITE } from "@/lib/ki/frage";
import { kostenCent, limitstand, monatsbeginn, preisAus } from "@/lib/ki/kosten";
import { IBAN_RE } from "@/lib/schwaerzen";

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const fehler = (status: number, meldung: string, extra: Record<string, unknown> = {}) => NextResponse.json({ fehler: meldung, ...extra }, { status });

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 800_000) return fehler(413, "Zu viel Text auf einmal.");
  const sb = await supabaseServer();
  const { data: anm } = await sb.auth.getClaims();
  const nutzer = anm?.claims?.sub;
  if (!nutzer) return fehler(401, "Nicht angemeldet.");

  let e: { haushaltId?: unknown; schaden?: Partial<SchadenEingabe>; police?: Partial<PoliceEingabe> };
  try { e = await req.json(); } catch { return fehler(400, "Ungültige Anfrage."); }
  const haushaltId = String(e.haushaltId ?? "");
  const s: SchadenEingabe = {
    datum: String(e.schaden?.datum ?? ""), beschreibung: typeof e.schaden?.beschreibung === "string" ? e.schaden.beschreibung.slice(0, 5000) : "",
    dinge: (Array.isArray(e.schaden?.dinge) ? e.schaden.dinge : []).slice(0, 30).map((x) => String(x).slice(0, 200)),
  };
  const p: PoliceEingabe = {
    kurzname: String(e.police?.kurzname ?? "Police").slice(0, 200), firma: e.police?.firma ? String(e.police.firma).slice(0, 200) : null,
    steckbriefVon: typeof e.police?.steckbriefVon === "string" && TAG.test(e.police.steckbriefVon) ? e.police.steckbriefVon : null,
    steckbrief: e.police?.steckbrief && typeof e.police.steckbrief === "object" ? e.police.steckbrief : null,
    seiten: (Array.isArray(e.police?.seiten) ? e.police.seiten : []).slice(0, 8).map((x) => ({ titel: String(x?.titel ?? "Dokument").slice(0, 200), nr: Number(x?.nr) || 1, text: typeof x?.text === "string" ? x.text.slice(0, MAX_SEITE) : "" })),
  };
  if (!UUID.test(haushaltId) || !TAG.test(s.datum) || s.beschreibung.trim().length < 5 || !p.steckbrief) return fehler(400, "Ungültige Anfrage.");
  if (klartextVerdacht([s.beschreibung, ...s.dinge, ...p.seiten.map((x) => x.text)])) return fehler(422, "In der Beschreibung oder den Seiten stehen noch Nummern oder eine IBAN. Bitte ohne diese Angaben beschreiben.");
  if (new RegExp(IBAN_RE.source).test(JSON.stringify(p.steckbrief))) return fehler(422, "Im Steckbrief steht eine IBAN.");

  const h = await sb.from("haushalte").select("id, einstellungen").eq("id", haushaltId).maybeSingle();
  if (!h.data) return fehler(403, "Kein Zugriff auf diesen Haushalt.");
  const einst = (h.data.einstellungen ?? {}) as Record<string, unknown>;
  const pr = await sb.from("ki_protokoll").select("kosten_cent").eq("haushalt_id", haushaltId).gte("zeitpunkt", monatsbeginn());
  const verbraucht = (pr.data ?? []).reduce((a, x) => a + Number(x.kosten_cent), 0);
  const limit = limitstand(verbraucht, einst);
  if (limit.gesperrt) return fehler(402, `Das KI-Limit für diesen Monat (${limit.limitCent / 100} €) ist erreicht.`, { limit });
  const anbieter = anbieterAus(process.env);
  if (!anbieter) return fehler(503, "Die KI ist noch nicht eingerichtet.");
  const protokoll = async (t: { ein: number; aus: number; denken: number } | null, erfolg: boolean) => {
    const kosten = t ? kostenCent(t, preisAus(process.env)) : 0;
    await sb.from("ki_protokoll").insert({ haushalt_id: haushaltId, nutzer_id: nutzer, aufgabe: "schaden", anbieter: anbieter.name, modell: anbieter.modell,
      seiten: p.seiten.length, eingabe_tokens: t?.ein ?? 0, ausgabe_tokens: (t?.aus ?? 0) + (t?.denken ?? 0), kosten_cent: kosten, erfolg });
    return kosten;
  };
  try {
    const r = await anbieter.auslesen(schadenPrompt(s, p), []);
    const kosten = await protokoll(r, true);
    return NextResponse.json({ ergebnis: jsonAus(r.text), kostenCent: kosten });
  } catch (err) {
    await protokoll(null, false);
    console.error("ki/schaden fehlgeschlagen:", err instanceof KiFehler ? err.code : "unbekannt", err instanceof KiFehler ? err.detail : "");
    return fehler(502, err instanceof KiFehler ? err.message : "Die KI ist gerade nicht erreichbar.");
  }
}

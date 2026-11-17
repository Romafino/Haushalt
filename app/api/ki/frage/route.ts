/* Frag die Akte (KI). Alles, was hier ankommt, wurde auf dem Gerät gegen die Schwärzliste ersetzt.
   schritt "auswahl": welche Seiten lesen? (nur wenn die Volltextsuche nichts fand)  schritt "antwort": Antwort mit Quellen.
   schritt "tochter": eine (geschwärzte) Antwort für die Tochter umformulieren.
   Ablauf wie /api/ki/dokument: Anmeldung → Mitgliedschaft (RLS) → Eingaben prüfen → Klartext-Sperre → Monatslimit → KI → Protokoll ohne Inhalt.
   Kein Service-Role-Schlüssel. Logs ohne Inhalte. */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { anbieterAus, KiFehler } from "@/lib/ki/anbieter";
import { jsonAus, klartextVerdacht, textSauber } from "@/lib/ki/antwort";
import { antwortPrompt, auswahlPrompt, MAX_FRAGE, MAX_SEITE, MAX_SEITEN_VERTRAG, tochterPrompt, type FrageSeite } from "@/lib/ki/frage";
import { kostenCent, limitstand, monatsbeginn, preisAus } from "@/lib/ki/kosten";
import { IBAN_RE } from "@/lib/schwaerzen";
import * as R from "@/lib/regeln";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const fehler = (status: number, meldung: string, extra: Record<string, unknown> = {}) => NextResponse.json({ fehler: meldung, ...extra }, { status });

type Eingabe = { haushaltId?: unknown; schritt?: unknown; frage?: unknown; stichtag?: unknown; kontext?: unknown; verzeichnis?: unknown; seiten?: unknown; antwort?: unknown };

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 1_500_000) return fehler(413, "Zu viel Text auf einmal.");
  const sb = await supabaseServer();
  const { data: anm } = await sb.auth.getClaims();
  const nutzer = anm?.claims?.sub;
  if (!nutzer) return fehler(401, "Nicht angemeldet.");

  let e: Eingabe;
  try { e = await req.json(); } catch { return fehler(400, "Ungültige Anfrage."); }
  const haushaltId = String(e.haushaltId ?? "");
  const schritt = e.schritt === "auswahl" || e.schritt === "antwort" || e.schritt === "tochter" ? e.schritt : null;
  const antwortIn = typeof e.antwort === "string" ? e.antwort.slice(0, 20000) : "";
  const frage = typeof e.frage === "string" ? e.frage.trim().slice(0, MAX_FRAGE) : "";
  if (!UUID.test(haushaltId) || !schritt || frage.length < 3 || (schritt === "tochter" && !antwortIn)) return fehler(400, "Ungültige Anfrage.");
  const heute = R.heute();
  const stichtag = typeof e.stichtag === "string" && TAG.test(e.stichtag) ? e.stichtag : heute;
  const seiten: FrageSeite[] = (Array.isArray(e.seiten) ? e.seiten : []).slice(0, MAX_SEITEN_VERTRAG).map((s: { titel?: unknown; nr?: unknown; text?: unknown }) => ({
    titel: String(s?.titel ?? "Dokument").slice(0, 200), nr: Number(s?.nr) || 1, text: typeof s?.text === "string" ? s.text.slice(0, MAX_SEITE) : "",
  }));
  const verzeichnis = Array.isArray(e.verzeichnis) ? e.verzeichnis.slice(0, 500) : [];
  const kontext = e.kontext && typeof e.kontext === "object" ? e.kontext : {};

  // zweite Sperre neben dem Gerät: Frage und Seiten ohne IBAN/lange Nummern; in den Einträgen keine IBAN
  // (Einträge sind JSON mit Beträgen, Daten und Firmen-Hotlines – dort nur die IBAN-Prüfung, Nummern werden gar nicht erst gespeichert)
  if (klartextVerdacht([frage, antwortIn, ...seiten.map((s) => s.text)])) return fehler(422, "In der Frage oder den Seiten stehen noch Nummern oder eine IBAN. Bitte ohne diese Angaben fragen.");
  if (new RegExp(IBAN_RE.source).test(JSON.stringify([kontext, verzeichnis]))) return fehler(422, "In der Akte steht eine IBAN. Bitte den Eintrag korrigieren.");

  const h = await sb.from("haushalte").select("id, einstellungen").eq("id", haushaltId).maybeSingle();
  if (!h.data) return fehler(403, "Kein Zugriff auf diesen Haushalt.");
  const einst = (h.data.einstellungen ?? {}) as Record<string, unknown>;
  const p = await sb.from("ki_protokoll").select("kosten_cent").eq("haushalt_id", haushaltId).gte("zeitpunkt", monatsbeginn());
  const verbraucht = (p.data ?? []).reduce((s, x) => s + Number(x.kosten_cent), 0);
  const limit = limitstand(verbraucht, einst);
  if (limit.gesperrt) return fehler(402, `Das KI-Limit für diesen Monat (${limit.limitCent / 100} €) ist erreicht.`, { limit });

  const anbieter = anbieterAus(process.env);
  if (!anbieter) return fehler(503, "Die KI ist noch nicht eingerichtet.");
  const protokoll = async (t: { ein: number; aus: number; denken: number } | null, erfolg: boolean) => {
    const kosten = t ? kostenCent(t, preisAus(process.env)) : 0;
    await sb.from("ki_protokoll").insert({ haushalt_id: haushaltId, nutzer_id: nutzer, aufgabe: "frage", anbieter: anbieter.name, modell: anbieter.modell,
      seiten: seiten.length, eingabe_tokens: t?.ein ?? 0, ausgabe_tokens: (t?.aus ?? 0) + (t?.denken ?? 0), kosten_cent: kosten, erfolg });
    return kosten;
  };

  try {
    if (schritt === "tochter") {
      const r = await anbieter.auslesen(tochterPrompt(frage, antwortIn), [], { json: false });
      const kosten = await protokoll(r, true);
      return NextResponse.json({ antwort: textSauber(r.text).slice(0, 5000), kostenCent: kosten, limit: limitstand(verbraucht + kosten, einst) });
    }
    if (schritt === "auswahl") {
      const r = await anbieter.auslesen(auswahlPrompt(frage, verzeichnis, heute), []);
      const kosten = await protokoll(r, true);
      return NextResponse.json({ auswahl: jsonAus(r.text), kostenCent: kosten, limit: limitstand(verbraucht + kosten, einst) });
    }
    const r = await anbieter.auslesen(antwortPrompt(frage, kontext, seiten, stichtag, heute), [], { json: false });
    const kosten = await protokoll(r, true);
    return NextResponse.json({ antwort: textSauber(r.text).slice(0, 20000), kostenCent: kosten, limit: limitstand(verbraucht + kosten, einst) });
  } catch (err) {
    await protokoll(null, false);
    const code = err instanceof KiFehler ? err.code : "unbekannt";
    console.error("ki/frage fehlgeschlagen:", code, err instanceof KiFehler ? err.detail : ""); // nie Inhalte
    return fehler(502, err instanceof KiFehler ? err.message : "Die KI ist gerade nicht erreichbar.");
  }
}

/* KI-Auslesen eines geschwärzten Dokuments.
   Ablauf: Anmeldung → Mitgliedschaft (RLS) → Eingaben prüfen → Klartext-Sperre → Monatslimit → KI → bereinigen → Protokoll (ohne Inhalt).
   Läuft mit der Anmeldung der Person, ohne Service-Role-Schlüssel. Logs enthalten keine Inhalte. */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { anbieterAus, KiFehler } from "@/lib/ki/anbieter";
import { dokumentPrompt, kurzakte } from "@/lib/ki/prompt";
import { jsonAus, klartextVerdacht, vorschlagAus } from "@/lib/ki/antwort";
import { kostenCent, limitstand, monatsbeginn, preisAus } from "@/lib/ki/kosten";
import * as R from "@/lib/regeln";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const fehler = (status: number, meldung: string, extra: Record<string, unknown> = {}) => NextResponse.json({ fehler: meldung, ...extra }, { status });

type Eingabe = { haushaltId?: unknown; seiten?: { nr?: unknown; text?: unknown }[]; bilder?: unknown[] };

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 4_200_000) return fehler(413, "Zu groß. Bitte weniger Seiten auf einmal senden.");
  const sb = await supabaseServer();
  const { data: anm } = await sb.auth.getClaims();
  const nutzer = anm?.claims?.sub;
  if (!nutzer) return fehler(401, "Nicht angemeldet.");

  let e: Eingabe;
  try { e = await req.json(); } catch { return fehler(400, "Ungültige Anfrage."); }
  const haushaltId = String(e.haushaltId ?? "");
  const seiten = Array.isArray(e.seiten) ? e.seiten : [];
  const bilder = Array.isArray(e.bilder) ? e.bilder : [];
  if (!UUID.test(haushaltId) || !seiten.length || seiten.length > 60 || bilder.length > 6) return fehler(400, "Ungültige Anfrage.");
  const texte = seiten.map((s, i) => ({ nr: Number(s.nr) || i + 1, text: typeof s.text === "string" ? s.text.slice(0, 20000) : "" }));
  if (!bilder.every((b) => typeof b === "string" && b.length < 1_000_000 && B64.test(b))) return fehler(400, "Ungültige Bilder.");

  // zweite Sperre neben dem Gerät: IBAN oder lange Nummern im Text → nicht senden
  if (klartextVerdacht(texte.map((t) => t.text))) return fehler(422, "Im Text stehen noch Nummern oder eine IBAN. Bitte auf dem Gerät nachschwärzen.");

  // Mitgliedschaft über RLS: nur Mitglieder sehen den Haushalt
  const h = await sb.from("haushalte").select("id, einstellungen").eq("id", haushaltId).maybeSingle();
  if (!h.data) return fehler(403, "Kein Zugriff auf diesen Haushalt.");
  const einst = (h.data.einstellungen ?? {}) as Record<string, unknown>;

  const [f, v, d, p] = await Promise.all([
    sb.from("firmen").select("id, name").eq("haushalt_id", haushaltId).is("verworfen_am", null),
    sb.from("vertraege").select("id, kurzname, art, status, firma_id").eq("haushalt_id", haushaltId).is("verworfen_am", null),
    sb.from("dinge").select("id, name, kategorie").eq("haushalt_id", haushaltId).is("verworfen_am", null),
    sb.from("ki_protokoll").select("kosten_cent").eq("haushalt_id", haushaltId).gte("zeitpunkt", monatsbeginn()),
  ]);
  const verbraucht = (p.data ?? []).reduce((s, x) => s + Number(x.kosten_cent), 0);
  const limit = limitstand(verbraucht, einst);
  if (limit.gesperrt) return fehler(402, `Das KI-Limit für diesen Monat (${limit.limitCent / 100} €) ist erreicht.`, { limit });

  const anbieter = anbieterAus(process.env);
  if (!anbieter) return fehler(503, "Die KI ist noch nicht eingerichtet.");
  const S = {
    firmen: f.data ?? [], dinge: d.data ?? [],
    vertraege: (v.data ?? []).map((x) => ({ ...x, firmaId: x.firma_id })),
  };
  const prompt = dokumentPrompt(texte, kurzakte(S), R.heute(), bilder.length);
  const protokoll = async (t: { ein: number; aus: number; denken: number } | null, erfolg: boolean) => {
    const kosten = t ? kostenCent(t, preisAus(process.env)) : 0;
    await sb.from("ki_protokoll").insert({ haushalt_id: haushaltId, nutzer_id: nutzer, aufgabe: "dokument", anbieter: anbieter.name, modell: anbieter.modell,
      seiten: texte.length, eingabe_tokens: t?.ein ?? 0, ausgabe_tokens: (t?.aus ?? 0) + (t?.denken ?? 0), kosten_cent: kosten, erfolg });
    return kosten;
  };

  try {
    const r = await anbieter.auslesen(prompt, bilder.map((b) => ({ mime: "image/jpeg" as const, base64: String(b) })));
    const kosten = await protokoll(r, true);
    const roh = jsonAus(r.text);
    if (!roh) return fehler(502, "Die Antwort der KI war nicht lesbar. Bitte erneut versuchen oder von Hand ausfüllen.");
    const vorschlag = vorschlagAus(roh, { vertraege: S.vertraege.map((x) => x.id), dinge: S.dinge.map((x) => x.id), firmen: S.firmen.map((x) => x.id) });
    return NextResponse.json({ vorschlag, kostenCent: kosten, limit: limitstand(verbraucht + kosten, einst) });
  } catch (err) {
    await protokoll(null, false);
    const code = err instanceof KiFehler ? err.code : "unbekannt";
    console.error("ki/dokument fehlgeschlagen:", code, err instanceof KiFehler ? err.detail : ""); // nur Code und Googles technischer Fehlertext, nie Inhalte
    return fehler(502, err instanceof KiFehler ? err.message : "Die KI ist gerade nicht erreichbar.");
  }
}

/* Prüft die KI-Einrichtung ohne Dokumentdaten: Schlüssel hinterlegt? eingestelltes Modell? verfügbare Modelle?
   ?probe=<modell>  winzige Testanfrage („antworte mit {"ok":true}“) an dieses Modell
   ?probe=alle      dasselbe parallel an mehrere Kandidaten, mit Dauer je Modell (Zeitlimit 25 s) */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { anbieterAus, gemini, KiFehler } from "@/lib/ki/anbieter";
import { preisAus } from "@/lib/ki/kosten";

export const maxDuration = 60;
const KANDIDATEN = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

async function probe(schluessel: string, modell: string, json: boolean, timeoutMs: number) {
  const t0 = Date.now();
  try {
    const r = await gemini(schluessel, modell, fetch, { json, timeoutMs }).auslesen('Antworte nur mit {"ok":true}', []);
    return { modell, json, ok: true, sekunden: (Date.now() - t0) / 1000, antwort: r.text.slice(0, 40), tokens: { ein: r.ein, aus: r.aus, denken: r.denken } };
  } catch (e) {
    return { modell, json, ok: false, sekunden: (Date.now() - t0) / 1000, fehler: e instanceof Error ? e.message : "unbekannt", detail: e instanceof KiFehler ? e.detail : "" };
  }
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  const a = anbieterAus(process.env);
  const schluessel = process.env.GEMINI_API_KEY;
  if (!a || !schluessel) return NextResponse.json({ eingerichtet: false });

  const p = req.nextUrl.searchParams.get("probe");
  if (p === "alle") {
    const laeufe = [...KANDIDATEN.map((m) => probe(schluessel, m, true, 25000)), probe(schluessel, "gemini-3.8-flash", false, 25000)];
    return NextResponse.json({ eingestellt: a.modell, ergebnisse: await Promise.all(laeufe) });
  }
  if (p) {
    if (!/^[a-z0-9.\-]{3,60}$/.test(p)) return NextResponse.json({ fehler: "Ungültiger Modellname." }, { status: 400 });
    return NextResponse.json(await probe(schluessel, p, true, 50000));
  }
  try {
    const modelle = await a.modelle();
    return NextResponse.json({ eingerichtet: true, anbieter: a.name, modell: a.modell, modellVerfuegbar: modelle.includes(a.modell), modelle, preis: preisAus(process.env) });
  } catch (e) {
    return NextResponse.json({ eingerichtet: true, anbieter: a.name, modell: a.modell, fehler: e instanceof Error ? e.message : "unbekannt" }, { status: 502 });
  }
}

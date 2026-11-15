/* Prüft die KI-Einrichtung ohne Dokumentdaten: Schlüssel hinterlegt? eingestelltes Modell? verfügbare Modelle?
   Mit ?probe=<modell> wird eine winzige Testanfrage („antworte mit {"ok":true}“) an dieses Modell geschickt. */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { anbieterAus, gemini, KiFehler } from "@/lib/ki/anbieter";
import { preisAus } from "@/lib/ki/kosten";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  const a = anbieterAus(process.env);
  if (!a) return NextResponse.json({ eingerichtet: false });

  const probe = req.nextUrl.searchParams.get("probe");
  if (probe && process.env.GEMINI_API_KEY) {
    if (!/^[a-z0-9.\-]{3,60}$/.test(probe)) return NextResponse.json({ fehler: "Ungültiger Modellname." }, { status: 400 });
    try {
      const r = await gemini(process.env.GEMINI_API_KEY, probe).auslesen('Antworte nur mit {"ok":true}', []);
      return NextResponse.json({ probe, ok: true, antwort: r.text.slice(0, 50), tokens: { ein: r.ein, aus: r.aus, denken: r.denken } });
    } catch (e) {
      return NextResponse.json({ probe, ok: false, fehler: e instanceof Error ? e.message : "unbekannt", detail: e instanceof KiFehler ? e.detail : "" });
    }
  }

  try {
    const modelle = await a.modelle();
    return NextResponse.json({ eingerichtet: true, anbieter: a.name, modell: a.modell, modellVerfuegbar: modelle.includes(a.modell), modelle, preis: preisAus(process.env) });
  } catch (e) {
    return NextResponse.json({ eingerichtet: true, anbieter: a.name, modell: a.modell, fehler: e instanceof Error ? e.message : "unbekannt" }, { status: 502 });
  }
}

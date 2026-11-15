/* Prüft die KI-Einrichtung ohne Inhalte: Ist ein Schlüssel hinterlegt, welches Modell ist eingestellt,
   welche Modelle bietet der Schlüssel an? Nur für angemeldete Nutzer; sendet keine Dokumentdaten. */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { anbieterAus } from "@/lib/ki/anbieter";
import { preisAus } from "@/lib/ki/kosten";

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  const a = anbieterAus(process.env);
  if (!a) return NextResponse.json({ eingerichtet: false });
  try {
    const modelle = await a.modelle();
    return NextResponse.json({ eingerichtet: true, anbieter: a.name, modell: a.modell, modellVerfuegbar: modelle.includes(a.modell), modelle, preis: preisAus(process.env) });
  } catch (e) {
    return NextResponse.json({ eingerichtet: true, anbieter: a.name, modell: a.modell, fehler: e instanceof Error ? e.message : "unbekannt" }, { status: 502 });
  }
}

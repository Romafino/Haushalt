import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUmgebung } from "./umgebung";

// /api/kalender: Abruf durch Kalender-Apps ohne Anmeldung, geschützt durch den geheimen Schlüssel im Link
// /api/cron: Vercel Cron ohne Anmeldung, geschützt durch CRON_SECRET
const OFFEN = ["/anmelden", "/api/kalender", "/api/cron"];

/**
 * Frischt die Anmeldung je Anfrage auf und leitet Nicht-Angemeldete zur Anmeldung.
 * Nur eine Vorprüfung: den eigentlichen Schutz der Daten leistet RLS.
 */
export async function sitzungAktualisieren(request: NextRequest) {
  const { url, schluessel } = supabaseUmgebung();
  let antwort = NextResponse.next({ request });

  const supabase = createServerClient(url, schluessel, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(neu, kopfzeilen) {
        neu.forEach(({ name, value }) => request.cookies.set(name, value));
        antwort = NextResponse.next({ request });
        neu.forEach(({ name, value, options }) => antwort.cookies.set(name, value, options));
        Object.entries(kopfzeilen ?? {}).forEach(([k, v]) => antwort.headers.set(k, String(v)));
      },
    },
  });

  // Prüft das Token (nicht nur das Cookie lesen).
  const { data } = await supabase.auth.getClaims();
  const angemeldet = !!data?.claims?.sub;
  const pfad = request.nextUrl.pathname;

  if (!angemeldet && !OFFEN.some((p) => pfad === p || pfad.startsWith(p + "/"))) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/anmelden";
    ziel.search = "";
    const umleitung = NextResponse.redirect(ziel);
    antwort.cookies.getAll().forEach((c) => umleitung.cookies.set(c));
    return umleitung;
  }
  return antwort;
}

/* Kalender-Abo (.ics) ohne Anmeldung, nur mit geheimem Schlüssel im Link.
   Kein Service-Role-Schlüssel: die Datenbankfunktion kalender_daten prüft den Hash und liefert nur den passenden Haushalt.
   Logs enthalten weder Schlüssel noch Inhalte. Endung „.ics“ am Schlüssel ist erlaubt. */
import { createClient } from "@supabase/supabase-js";
import { supabaseUmgebung } from "@/lib/supabase/umgebung";
import { akteAus, type Rohdaten } from "@/lib/akte/abbilden";
import { kalenderIcs, SCHLUESSEL_RE } from "@/lib/akte/kalender";
import * as R from "@/lib/regeln";

const nichtGefunden = () => new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: Request, ctx: { params: Promise<{ schluessel: string }> }) {
  const schluessel = (await ctx.params).schluessel.replace(/\.ics$/, "");
  if (!SCHLUESSEL_RE.test(schluessel)) return nichtGefunden();
  const { url, schluessel: oeffentlich } = supabaseUmgebung();
  const sb = createClient(url, oeffentlich, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("kalender_daten", { p_schluessel: schluessel });
  if (error) {
    console.error("kalender: Abruf fehlgeschlagen", error.code); // ohne Schlüssel, ohne Inhalte
    return new Response("Vorübergehend nicht verfügbar", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!data) return nichtGefunden();
  const ics = kalenderIcs(akteAus(data as Rohdaten), R.heute(), new Date());
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="haushalt.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

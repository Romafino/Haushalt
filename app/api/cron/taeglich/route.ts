/* Täglicher Lauf (Vercel Cron, einmal am Tag): je Haushalt Wartung (Vertragsende eintragen, verpasste Fristen fortschreiben)
   und Push für Fristen an festen Tagen. Nur mit CRON_SECRET (Vercel sendet ihn als Bearer-Token).
   Einzige Stelle mit Service-Role-Schlüssel. Logs: nur Zahlen, keine Inhalte. */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseDienst } from "@/lib/supabase/dienst";
import { ladeAkte } from "@/lib/akte/laden";
import { opsUebersetzen } from "@/lib/akte/ops";
import { faelligeErinnerungen, pushNachricht } from "@/lib/akte/push";
import { pushEingerichtet, pushSenden } from "@/lib/push/senden";
import * as R from "@/lib/regeln";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const geheim = process.env.CRON_SECRET;
  if (!geheim || req.headers.get("authorization") !== `Bearer ${geheim}`) return NextResponse.json({ fehler: "Nicht erlaubt." }, { status: 401 });
  const sb = supabaseDienst();
  const heute = R.heute();
  const { data: haushalte, error } = await sb.from("haushalte").select("id").is("verworfen_am", null);
  if (error) { console.error("cron: Haushalte nicht lesbar", error.code); return NextResponse.json({ fehler: "Datenbank" }, { status: 500 }); }

  const stand = { haushalte: 0, wartung: 0, nachrichten: 0, gesendet: 0, abgelaufen: 0, fehler: 0 };
  for (const h of haushalte ?? []) {
    try {
      let S = await ladeAkte(sb, h.id);
      const ops = R.wartung(S, heute);
      if (ops.length) {
        const r = await sb.rpc("ops_anwenden", { p_haushalt_id: h.id, p_ops: opsUebersetzen(ops, S) });
        if (r.error) throw new Error("wartung " + r.error.code);
        stand.wartung += ops.length;
        S = await ladeAkte(sb, h.id);
      }
      const n = pushEingerichtet() ? pushNachricht(faelligeErinnerungen(S, heute), heute) : null;
      if (n) {
        const { data: abos } = await sb.from("push_abos").select("id, endpoint, p256dh, auth").eq("haushalt_id", h.id);
        if (abos?.length) {
          stand.nachrichten++;
          const r = await pushSenden(abos, n);
          stand.gesendet += r.gesendet; stand.fehler += r.fehler; stand.abgelaufen += r.abgelaufen.length;
          if (r.abgelaufen.length) await sb.from("push_abos").delete().in("id", r.abgelaufen);
        }
      }
      stand.haushalte++;
    } catch (e) {
      stand.fehler++;
      console.error("cron: Haushalt übersprungen", e instanceof Error ? e.message.slice(0, 80) : "unbekannt");
    }
  }
  console.log("cron: fertig", JSON.stringify(stand));
  return NextResponse.json(stand);
}

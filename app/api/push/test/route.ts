/* Test-Nachricht an die eigenen Geräte. Läuft mit der Anmeldung der Person (RLS: nur eigene Geräte), ohne Service-Role. */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { pushEingerichtet, pushSenden } from "@/lib/push/senden";

export async function POST() {
  const sb = await supabaseServer();
  const { data: anm } = await sb.auth.getClaims();
  if (!anm?.claims?.sub) return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  if (!pushEingerichtet()) return NextResponse.json({ fehler: "Push ist auf dem Server noch nicht eingerichtet." }, { status: 503 });
  const { data, error } = await sb.from("push_abos").select("id, endpoint, p256dh, auth");
  if (error) return NextResponse.json({ fehler: "Geräte konnten nicht geladen werden." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ fehler: "Auf diesem Konto ist noch kein Gerät eingetragen." }, { status: 400 });
  const r = await pushSenden(data, { title: "Haushalt", body: "Test: Erinnerungen kommen an.", url: "/kalender", tag: "test" });
  if (r.abgelaufen.length) await sb.from("push_abos").delete().in("id", r.abgelaufen);
  return NextResponse.json(r);
}

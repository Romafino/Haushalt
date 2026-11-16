import "server-only";
/* Web-Push-Versand (VAPID). Schlüssel nur aus Umgebungsvariablen. Logs ohne Inhalte und ohne Geräteadressen. */
import webpush from "web-push";
import type { PushNachricht } from "@/lib/akte/push";

export type Abo = { id: string; endpoint: string; p256dh: string; auth: string };

export function pushEingerichtet(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Sendet an alle Abos; gibt die IDs zurück, die es nicht mehr gibt (404/410) und gelöscht werden sollen. */
export async function pushSenden(abos: Abo[], n: PushNachricht): Promise<{ gesendet: number; abgelaufen: string[]; fehler: number }> {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://haushalt-roma-fino.vercel.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const daten = JSON.stringify(n);
  let gesendet = 0, fehler = 0;
  const abgelaufen: string[] = [];
  await Promise.all(abos.map(async (a) => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, daten, { TTL: 60 * 60 * 20, urgency: "normal" });
      gesendet++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) abgelaufen.push(a.id);
      else { fehler++; console.error("push: Versand fehlgeschlagen", status ?? "ohne Status"); }
    }
  }));
  return { gesendet, abgelaufen, fehler };
}

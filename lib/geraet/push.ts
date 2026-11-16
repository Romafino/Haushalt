"use client";
/* Push auf diesem Gerät: Service Worker registrieren, Abo anlegen/entfernen. Auf dem iPhone nur in der installierten App (Home-Bildschirm). */
import { supabaseBrowser } from "@/lib/supabase/browser";

export type PushStand = "nicht-moeglich" | "installieren" | "blockiert" | "aus" | "an";

const b64 = (s: string) => {
  const p = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
};
const istIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installiert = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export async function swRegistrieren() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function pushStand(): Promise<PushStand> {
  if (istIos() && !installiert()) return "installieren";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "nicht-moeglich";
  if (Notification.permission === "denied") return "blockiert";
  const reg = await swRegistrieren();
  const abo = await reg?.pushManager.getSubscription();
  return abo ? "an" : "aus";
}

export async function pushEinschalten(haushaltId: string): Promise<string | null> {
  const schluessel = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!schluessel) return "Push ist auf dem Server noch nicht eingerichtet.";
  if ((await Notification.requestPermission()) !== "granted") return "Mitteilungen wurden nicht erlaubt.";
  const reg = await swRegistrieren();
  if (!reg) return "Dieses Gerät unterstützt keine Push-Nachrichten.";
  await navigator.serviceWorker.ready;
  const abo = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(schluessel) }));
  const j = abo.toJSON();
  const { error } = await supabaseBrowser().from("push_abos").upsert(
    { haushalt_id: haushaltId, endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, geraet: istIos() ? "iPhone/iPad" : navigator.platform.slice(0, 40) },
    { onConflict: "endpoint" },
  );
  return error ? "Das Gerät konnte nicht gespeichert werden." : null;
}

export async function pushAusschalten(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const abo = await reg?.pushManager.getSubscription();
  if (!abo) return null;
  const { error } = await supabaseBrowser().from("push_abos").delete().eq("endpoint", abo.endpoint);
  await abo.unsubscribe();
  return error ? "Das Gerät konnte nicht entfernt werden." : null;
}

/* Service Worker: nur Push-Nachrichten anzeigen und beim Antippen die App öffnen. Kein Zwischenspeichern von Daten. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let n = { title: "Haushalt", body: "", url: "/", tag: "haushalt" };
  try { n = { ...n, ...e.data.json() }; } catch (_) { /* leere oder fremde Nachricht */ }
  e.waitUntil(self.registration.showNotification(n.title, { body: n.body, tag: n.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: n.url } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ziel = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenster) => {
    for (const f of fenster) if (f.url.startsWith(self.location.origin)) { f.focus(); return f.navigate(ziel); }
    return self.clients.openWindow(ziel);
  }));
});

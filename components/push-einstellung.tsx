"use client";
/* Push-Erinnerungen auf diesem Gerät ein-/ausschalten und testen. */
import { useEffect, useState } from "react";
import { pushAusschalten, pushEinschalten, pushStand, type PushStand } from "@/lib/geraet/push";
import { einrichtungsSchluessel } from "@/lib/geraet/schluesselpaar";

export function PushEinstellung({ haushaltId }: { haushaltId: string | null }) {
  const [stand, setStand] = useState<PushStand | null>(null);
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => { void pushStand().then(setStand).catch(() => setStand("nicht-moeglich")); }, []);

  async function aktion(f: () => Promise<string | null>) {
    setLaeuft(true); setMeldung("");
    try { const fehler = await f(); if (fehler) setMeldung(fehler); } catch { setMeldung("Das hat nicht geklappt."); }
    setStand(await pushStand().catch(() => "nicht-moeglich" as PushStand));
    setLaeuft(false);
  }
  async function testen() {
    setLaeuft(true); setMeldung("");
    const r = await fetch("/api/push/test", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMeldung(r.ok ? (j.gesendet ? "Test-Nachricht gesendet." : "Keine Nachricht zugestellt.") : j.fehler ?? "Das hat nicht geklappt.");
    setLaeuft(false);
  }

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return <PushEinrichten />;

  return (
    <section className="karte">
      <h2>Push-Erinnerungen</h2>
      <p className="leise">Eine Nachricht am Morgen, wenn eine Frist ansteht: am Beginn des Vorlaufs, 14 und 7 Tage vorher, am Vortag, am Tag selbst und einen Tag danach. Nur Titel und Abstand, keine Notizen.</p>
      {stand === null && <p className="leise">Wird geprüft …</p>}
      {stand === "installieren" && <p>Auf dem iPhone geht Push nur in der installierten App: in Safari unten auf „Teilen“ → „Zum Home-Bildschirm“, dann die App vom Home-Bildschirm öffnen und hier einschalten.</p>}
      {stand === "nicht-moeglich" && <p>Dieser Browser unterstützt keine Push-Nachrichten.</p>}
      {stand === "blockiert" && <p>Mitteilungen sind für diese App blockiert. Bitte in den Einstellungen des Geräts erlauben (iPhone: Einstellungen → Mitteilungen → Haushalt).</p>}
      {stand === "aus" && <button disabled={laeuft || !haushaltId} onClick={() => haushaltId && aktion(() => pushEinschalten(haushaltId))}>Auf diesem Gerät einschalten</button>}
      {stand === "an" && (
        <div className="aktionen">
          <button disabled={laeuft} onClick={testen}>Test senden</button>
          <button className="zweitrangig" disabled={laeuft} onClick={() => aktion(pushAusschalten)}>Ausschalten</button>
        </div>
      )}
      {meldung && <p className="leise" role="status">{meldung}</p>}
    </section>
  );
}

/* Nur sichtbar, solange in Vercel kein VAPID-Schlüssel hinterlegt ist. */
function PushEinrichten() {
  const [s, setS] = useState<{ oeffentlich: string; privat: string; cron: string } | null>(null);
  const zeile = (name: string, wert: string, geheim: boolean) => (
    <li className="eintrag">
      <strong>{name}</strong>
      <span className="leise">{geheim ? "geheim – in Vercel als „Sensitive“ anlegen" : "öffentlich"}</span>
      <code style={{ wordBreak: "break-all", userSelect: "all" }}>{wert}</code>
    </li>
  );
  return (
    <section className="karte">
      <h2>Push einrichten (einmalig)</h2>
      <p className="leise">Für Push braucht der Server ein Schlüsselpaar und für den täglichen Lauf ein Geheimnis. Beides wird hier auf deinem Gerät erzeugt. Trag es in Vercel ein (Settings → Environment Variables, Umgebung Production) und gib es sonst nirgends weiter.</p>
      {!s && <button onClick={async () => setS(await einrichtungsSchluessel())}>Schlüssel erzeugen</button>}
      {s && (
        <ul className="liste">
          {zeile("NEXT_PUBLIC_VAPID_PUBLIC_KEY", s.oeffentlich, false)}
          {zeile("VAPID_PRIVATE_KEY", s.privat, true)}
          {zeile("CRON_SECRET", s.cron, true)}
        </ul>
      )}
      <p className="leise">Danach in Vercel neu bereitstellen (Redeploy). Dieser Abschnitt verschwindet dann.</p>
    </section>
  );
}

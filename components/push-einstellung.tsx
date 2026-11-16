"use client";
/* Push-Erinnerungen auf diesem Gerät ein-/ausschalten und testen. */
import { useEffect, useState } from "react";
import { pushAusschalten, pushEinschalten, pushStand, type PushStand } from "@/lib/geraet/push";

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

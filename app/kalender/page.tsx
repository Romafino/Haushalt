"use client";
/* Kalender-Abo einrichten: geheimer Link, den der Kalender (z. B. auf dem iPhone) regelmäßig abruft.
   Der Schlüssel entsteht hier im Browser; gespeichert wird nur sein Hash. Der Link ist deshalb nur direkt nach dem Erzeugen sichtbar. */
import { useEffect, useState } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { neuerSchluessel, schluesselHash } from "@/lib/akte/kalender";
import { PushEinstellung } from "@/components/push-einstellung";

export default function Kalender() {
  const { haushaltId, fehler: ladeFehler } = useAkte();
  const [vorhanden, setVorhanden] = useState<string | null | undefined>(undefined);
  const [link, setLink] = useState("");
  const [fehler, setFehler] = useState("");
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    if (!haushaltId) return;
    void supabaseBrowser().from("kalender_zugang").select("erstellt_am").eq("haushalt_id", haushaltId).maybeSingle()
      .then(({ data, error }) => (error ? setFehler("Stand konnte nicht geladen werden.") : setVorhanden(data?.erstellt_am ?? null)));
  }, [haushaltId]);

  async function erzeugen() {
    if (!haushaltId) return;
    if (vorhanden && !confirm("Neuen Link erzeugen? Der bisherige Link funktioniert danach nicht mehr – auch nicht in Kalendern, die ihn schon abonniert haben.")) return;
    setFehler(""); setKopiert(false);
    const s = neuerSchluessel();
    const { error } = await supabaseBrowser().from("kalender_zugang").upsert({ haushalt_id: haushaltId, hash: await schluesselHash(s), erstellt_am: new Date().toISOString() });
    if (error) return setFehler("Der Link konnte nicht gespeichert werden.");
    setLink(`${location.origin}/api/kalender/${s}.ics`);
    setVorhanden(new Date().toISOString());
  }

  async function loeschen() {
    if (!haushaltId || !confirm("Kalender-Link löschen? Abonnierte Kalender bekommen danach keine Termine mehr.")) return;
    const { error } = await supabaseBrowser().from("kalender_zugang").delete().eq("haushalt_id", haushaltId);
    if (error) return setFehler("Der Link konnte nicht gelöscht werden.");
    setLink(""); setVorhanden(null);
  }

  return (
    <main className="seite">
      <Kopf zurueck="/" text="Übersicht" />
      <h1>Erinnerungen</h1>
      <PushEinstellung haushaltId={haushaltId} />
      <section className="karte">
        <h2>Kalender-Abo</h2>
        <p>Alle offenen Fristen und Termine erscheinen in deinem Kalender – ganztägig, mit Erinnerung um 9 Uhr, bei Kündigungsfristen zusätzlich Wochen vorher. Der Kalender holt Änderungen selbst ab.</p>
        <p className="leise">In den Kalender gehen nur Titel und Datum, keine Notizen. Wer den Link kennt, sieht diese Termine – nicht weitergeben.</p>
        {vorhanden === undefined && !fehler && !ladeFehler && <p className="leise">Wird geladen …</p>}
        {vorhanden === null && !link && <button onClick={erzeugen} disabled={!haushaltId}>Link erzeugen</button>}
        {vorhanden && !link && (
          <>
            <p className="leise">Es gibt einen Link (seit {new Date(vorhanden).toLocaleDateString("de-DE")}). Er wird aus Sicherheitsgründen nicht noch einmal angezeigt.</p>
            <div className="aktionen">
              <button onClick={erzeugen}>Neuen Link erzeugen</button>
              <button className="zweitrangig" onClick={loeschen}>Link löschen</button>
            </div>
          </>
        )}
        {link && (
          <>
            <a className="knopf gross" href={link.replace(/^https?:/, "webcal:")}>Im Kalender abonnieren</a>
            <p className="leise" style={{ wordBreak: "break-all" }}>{link}</p>
            <button className="zweitrangig" onClick={async () => { try { await navigator.clipboard.writeText(link); setKopiert(true); } catch { setKopiert(false); } }}>{kopiert ? "Kopiert" : "Link kopieren"}</button>
            <p className="leise">Der Link wird nur jetzt angezeigt. Auf dem iPhone: „Im Kalender abonnieren“ antippen und bestätigen. Wie oft der Kalender neu abruft, bestimmt die Kalender-App.</p>
          </>
        )}
        {(fehler || ladeFehler) && <p className="fehler" role="alert">{fehler || ladeFehler}</p>}
      </section>
    </main>
  );
}

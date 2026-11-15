"use client";
/* Lebensereignisse: nur Aufgaben und Prüftermine für Verträge der Rolle, keine Beratung. */
import { useState } from "react";
import { useAkte, opsAnwenden } from "@/lib/akte/useAkte";
import { opsUebersetzen } from "@/lib/akte/ops";
import * as R from "@/lib/regeln";
import { Kopf } from "@/components/akte/kopf";

type Leben = { key: string; name: string; rolle?: string; aufgaben: string[]; auto: boolean };

export default function Lebensereignisse() {
  const { akte, haushaltId, fehler, neuLaden } = useAkte();
  const [wahl, setWahl] = useState("");
  const [datum, setDatum] = useState("");
  const [dingId, setDingId] = useState("");
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const liste: Leben[] = akte ? R.lebenListe(akte.einst) : [];
  const def = liste.find((l) => l.key === wahl);
  const tag = datum || (akte ? R.heute() : "");
  const vorschau = akte && def ? R.lebensFolgen(def, tag, akte, R.heute(), dingId || undefined) : null;

  async function uebernehmen() {
    if (!akte || !haushaltId || !vorschau) return;
    setLaeuft(true);
    try {
      await opsAnwenden(haushaltId, opsUebersetzen(vorschau.ops, akte));
      await neuLaden();
      setMeldung(`Übernommen: ${vorschau.hinweise.length} Aufgabe(n) stehen jetzt unter Termine.`);
      setWahl("");
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : "Hat nicht geklappt.");
    }
    setLaeuft(false);
  }

  return (
    <main className="seite">
      <Kopf />
      <h1>Lebensereignis</h1>
      <p className="leise">Erzeugt Aufgaben zum Prüfen und Prüftermine für laufende Verträge der betroffenen Person. Keine Beratung.</p>
      {fehler && <p className="fehler" role="alert">{fehler}</p>}
      {akte && (
        <section className="karte">
          <label>Was ändert sich?
            <select value={wahl} onChange={(e) => { setWahl(e.target.value); setMeldung(""); }}>
              <option value="">bitte wählen</option>
              {liste.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
          </label>
          {def && <label>Zum (Datum)<input type="date" value={tag} onChange={(e) => setDatum(e.target.value)} /></label>}
          {def?.auto && (
            <label>Welches Auto?
              <select value={dingId} onChange={(e) => setDingId(e.target.value)}>
                <option value="">–</option>
                {akte.dinge.filter((d) => d.kategorie === "Auto").map((d) => <option key={d.id} value={d.id}>{String(d.name)}</option>)}
              </select>
            </label>
          )}
          {vorschau && (
            <div className="vorschau">
              <strong>Das wird angelegt:</strong>
              <ul>{vorschau.hinweise.map((h: string, i: number) => <li key={i}>{h}</li>)}</ul>
              <button onClick={uebernehmen} disabled={laeuft}>{laeuft ? "Wird übernommen …" : "Übernehmen"}</button>
            </div>
          )}
          {meldung && <p className="leise" role="status">{meldung}</p>}
        </section>
      )}
    </main>
  );
}

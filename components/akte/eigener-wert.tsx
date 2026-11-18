"use client";
/* Auswahl mit „＋ Eigener Wert …“: Wert eintippen, prüfen, sofort wählen und in „Eigene Listen“ übernehmen. */
import { useState } from "react";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { eigenerWert, eigenerWertFehler, MAX_EIGEN } from "@/lib/akte/eigene";
import { eigenenWertSpeichern } from "@/lib/geraet/eigene";

const EIGEN = "__eigen__";

/** Nur das Eingabefeld (z. B. für „Für wen“ mit Mehrfachauswahl). */
export function EigenEingabe({ liste, haushaltId, onWert, knopf = "＋ Eigener Wert …", offen: start = false, onAbbrechen }: {
  liste: string; haushaltId?: string; onWert: (w: string) => void; knopf?: string; offen?: boolean; onAbbrechen?: () => void;
}) {
  const sl = useSchwaerzliste();
  const [offen, setOffen] = useState(start);
  const [text, setText] = useState("");
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function uebernehmen() {
    const f = eigenerWertFehler(text, sl.liste);
    if (f) return setMeldung(f);
    const w = eigenerWert(text);
    onWert(w);
    setLaeuft(true);
    const fehler = haushaltId ? await eigenenWertSpeichern(haushaltId, liste, w) : null;
    setLaeuft(false);
    setText(""); setOffen(start);
    setMeldung(fehler ?? `„${w}“ übernommen und unter „Eigene Listen“ gespeichert.`);
  }

  if (!offen) return (
    <>
      <button type="button" className="zweitrangig klein" onClick={() => { setOffen(true); setMeldung(""); }}>{knopf}</button>
      {meldung && <span className="leise" role="status">{meldung}</span>}
    </>
  );
  return (
    <div className="eigen">
      <div className="knoepfe">
        <input aria-label="Eigener Wert" autoFocus maxLength={MAX_EIGEN} value={text} placeholder="Eigener Wert"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void uebernehmen(); } }} />
        <button type="button" onClick={uebernehmen} disabled={laeuft}>Übernehmen</button>
        <button type="button" className="zweitrangig" onClick={() => { setOffen(false); setText(""); setMeldung(""); onAbbrechen?.(); }}>Abbrechen</button>
      </div>
      {meldung && <span className="fehler" role="status">{meldung}</span>}
    </div>
  );
}

/** Auswahl (select) mit eigenem Wert am Ende. */
export function WahlMitEigenem({ id, wert, optionen, leer, setze, liste, haushaltId, invalid, beschrieben }: {
  id?: string; wert: string; optionen: { wert: string; text: string }[]; leer?: string; setze: (w: string) => void;
  liste: string; haushaltId?: string; invalid?: boolean; beschrieben?: string;
}) {
  const [eingabe, setEingabe] = useState(false);
  return (
    <>
      <select id={id} aria-invalid={invalid} aria-describedby={beschrieben} value={eingabe ? EIGEN : wert}
        onChange={(e) => { if (e.target.value === EIGEN) setEingabe(true); else { setEingabe(false); setze(e.target.value); } }}>
        {leer !== undefined && <option value="">{leer}</option>}
        {optionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}
        <option value={EIGEN}>＋ Eigener Wert …</option>
      </select>
      {eingabe && <EigenEingabe liste={liste} haushaltId={haushaltId} offen onWert={(w) => { setze(w); setEingabe(false); }} onAbbrechen={() => setEingabe(false)} />}
    </>
  );
}

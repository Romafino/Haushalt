"use client";
/* Nummern aus dem Tresor zu einem Vertrag oder Schadenfall: nur auf dem entsperrten Gerät sichtbar, nie an eine KI. */
import Link from "next/link";
import { useState } from "react";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { ARTEN, nummerPruefen, type Art } from "@/lib/schwaerzen/tresor";

export function TresorNummern({ bezugId, vorschlag = "Vertragsnummer" }: { bezugId: string; vorschlag?: Art }) {
  const sl = useSchwaerzliste();
  const [art, setArt] = useState<Art>(vorschlag);
  const [nummer, setNummer] = useState("");
  const [meldung, setMeldung] = useState("");
  const liste = sl.nummern[bezugId] ?? [];

  async function speichern(neu: typeof liste) {
    const t = { ...sl.nummern };
    if (neu.length) t[bezugId] = neu; else delete t[bezugId];
    setMeldung((await sl.nummernSpeichern(t)) ?? "Gespeichert (verschlüsselt).");
  }

  return (
    <details className="karte">
      <summary>Nummern (Tresor)</summary>
      {sl.zustand !== "offen" ? (
        <p className="leise">Die Nummern liegen verschlüsselt im Tresor. <Link href="/schwaerzliste">Schwärzliste entsperren</Link>, um sie zu sehen.</p>
      ) : (
        <>
          <p className="leise">Nur auf diesem Gerät sichtbar, verschlüsselt gespeichert, gehen nie an eine KI. In Dokumenten werden sie automatisch geschwärzt.</p>
          {liste.length > 0 && (
            <ul className="liste">
              {liste.map((n, i) => (
                <li key={n.art + n.nummer} className="eintrag zeile">
                  <span><span className="leise">{n.art}</span><br /><strong style={{ userSelect: "all" }}>{n.nummer}</strong></span>
                  <span className="aktionen" style={{ gridTemplateColumns: "auto auto" }}>
                    <button type="button" className="klein zweitrangig" onClick={() => navigator.clipboard.writeText(n.nummer).then(() => setMeldung("Kopiert.")).catch(() => {})}>Kopieren</button>
                    <button type="button" className="klein zweitrangig" onClick={() => confirm(`${n.art} aus dem Tresor entfernen?`) && speichern(liste.filter((_, j) => j !== i))}>Entfernen</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="formular">
            <label><span>Art</span><select value={art} onChange={(e) => setArt(e.target.value as Art)}>{ARTEN.map((a) => <option key={a}>{a}</option>)}</select></label>
            <label><span>Nummer</span><input value={nummer} autoComplete="off" maxLength={60} onChange={(e) => setNummer(e.target.value)} /></label>
            <button type="button" disabled={nummer.trim().length < 3} onClick={async () => {
              const f = nummerPruefen({ art, nummer });
              if (f) return setMeldung(f);
              await speichern([...liste, { art, nummer: nummer.trim() }]); setNummer("");
            }}>Hinzufügen</button>
          </div>
        </>
      )}
      {meldung && <p className="leise" role="status">{meldung}</p>}
    </details>
  );
}

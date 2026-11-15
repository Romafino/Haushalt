/* Steckbrief einer Police: nur Felder mit Inhalt, deutsche Überschriften. */
import { steckbriefAnzeige } from "@/lib/akte/steckbrief";

export function SteckbriefListe({ sb }: { sb: unknown }) {
  const teile = steckbriefAnzeige(sb);
  if (!teile.length) return <p className="leise">Im Dokument wurden keine Angaben für den Steckbrief gefunden (Gefahren, Summen, Ausschlüsse …). Das heißt „unklar“, nicht „nicht versichert“.</p>;
  return (
    <ul className="liste">
      {teile.map((a) => (
        <li key={a.titel} className="eintrag">
          <strong>{a.titel}</strong>
          {a.zeilen.length === 1 ? <span className="leise">{a.zeilen[0]}</span> : <ul className="leise punkte">{a.zeilen.map((z, i) => <li key={i}>{z}</li>)}</ul>}
        </li>
      ))}
    </ul>
  );
}

/* Ergebnis der Prüfung für eine Police. Optional: Pflichten/Fristen als Termin übernehmen. */
import { GREIFT } from "./status";
import * as R from "@/lib/regeln";

export type PruefungAnzeige = {
  kurzname?: string | null; firma?: string | null; hotline?: string | null; greift: string; andereSparte?: boolean; begruendung: string;
  fundstellen: { seite?: number | null; klausel?: string | null }[]; ausschluesse: string[]; selbstbeteiligung: string | null;
  pflichten: string[]; fristen: string[]; offeneFragen: string[]; steckbriefVon?: string | null;
};

const Liste = ({ titel, l, termin }: { titel: string; l: string[]; termin?: (t: string) => void }) =>
  l.length ? (
    <div>
      <strong>{titel}</strong>
      <ul className="punkte leise">
        {l.map((x) => <li key={x}>{x}{termin && <> <button type="button" className="klein zweitrangig" onClick={() => termin(x)}>Als Termin</button></>}</li>)}
      </ul>
    </div>
  ) : null;

export function PruefungKarte({ p, termin }: { p: PruefungAnzeige; termin?: (text: string) => void }) {
  const farbe = p.greift === "ja" ? "var(--akzent)" : p.greift === "nein" ? "var(--fehler)" : "var(--leise)";
  return (
    <section className="karte">
      <div className="zeile">
        <h3>{p.kurzname ?? "Police"}{p.firma ? <span className="leise"> · {p.firma}</span> : null}</h3>
        <strong style={{ color: farbe, whiteSpace: "nowrap" }}>{GREIFT[p.greift] ?? p.greift}</strong>
      </div>
      {p.andereSparte && <p className="leise">Andere Sparte – passt nicht zu diesem Schaden.</p>}
      {p.begruendung && <p>{p.begruendung}</p>}
      {p.fundstellen.length > 0 && <p className="leise">Fundstellen: {p.fundstellen.map((f) => [f.seite ? "S. " + f.seite : "", f.klausel].filter(Boolean).join(" ")).join("; ")}{p.steckbriefVon ? ` (Fassung ab ${R.fmt(p.steckbriefVon)})` : ""}</p>}
      <Liste titel="Ausschlüsse" l={p.ausschluesse} />
      {p.selbstbeteiligung && <p className="leise"><strong>Selbstbeteiligung:</strong> {p.selbstbeteiligung}</p>}
      <Liste titel="Pflichten" l={p.pflichten} termin={termin} />
      <Liste titel="Meldefristen" l={p.fristen} termin={termin} />
      <Liste titel="Beim Versicherer klären" l={p.offeneFragen} />
      {p.hotline && <a href={"tel:" + p.hotline.replace(/[^\d+]/g, "")} className="knopf zweitrangig">Hotline anrufen: {p.hotline}</a>}
    </section>
  );
}

"use client";
/* Notfallblatt: zum Ausdrucken (Drucken → als PDF sichern) und offline auf diesem Gerät.
   Ohne Nummern unkritisch für den Papierordner; mit Nummern nur auf dem entsperrten Gerät. */
import { useEffect, useState } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { notfallblatt, notfallblattBloecke, type Notfallblatt } from "@/lib/akte/notfallblatt";
import { pdf } from "@/lib/export/pdf";
import { dateiTeilen } from "@/lib/geraet/teilen";
import { notfallMerken } from "@/lib/geraet/schaden";
import * as R from "@/lib/regeln";

function Tabelle({ titel, zeilen }: { titel: string; zeilen: Notfallblatt["versicherungen"] }) {
  if (!zeilen.length) return null;
  return (
    <section className="karte druck-karte">
      <h2>{titel}</h2>
      <table className="blatt">
        <thead><tr><th>Vertrag</th><th>Anbieter / Hotline</th><th>Original liegt</th><th>Nächste Frist</th></tr></thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.id || z.name}>
              <td><strong>{z.name}</strong>{z.fuerWen ? <><br /><span className="leise">für {z.fuerWen}</span></> : null}{z.bezug ? <><br /><span className="leise">{z.bezug}</span></> : null}
                {z.nummern.map((x) => <div key={x} className="leise">{x}</div>)}</td>
              <td>{z.firma}{z.hotline ? <><br /><a href={"tel:" + z.hotline.replace(/[^\d+]/g, "")}>{z.hotline}</a></> : null}</td>
              <td>{z.ablageort || <span className="leise">–</span>}</td>
              <td>{z.frist ? <>{R.fmt(z.frist.datum)}<br /><span className="leise">{z.frist.titel}</span></> : <span className="leise">–</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function NotfallblattSeite() {
  const { akte, fehler } = useAkte();
  const sl = useSchwaerzliste();
  const [mitNummern, setMitNummern] = useState(false);
  const [meldung, setMeldung] = useState("");
  useEffect(() => { if (sl.zustand === "unbekannt") void sl.pruefen(); }, [sl]);
  useEffect(() => { if (akte) notfallMerken(akte); }, [akte]);
  const nummernAn = mitNummern && sl.zustand === "offen";
  const n = akte ? notfallblatt(akte, R.heute(), nummernAn ? sl.nummern : undefined) : null;


  return (
    <main className="seite breit">
      <div className="nicht-drucken"><Kopf zurueck="/" text="Übersicht" /></div>
      <h1>Notfallblatt</h1>
      <section className="karte nicht-drucken">
        <p className="leise">Für den Papierordner oder eine Vertrauensperson: alle laufenden Verträge mit Anbieter, Hotline, Ablageort und nächster Frist. Ohne Beträge und ohne Nummern – unkritisch zum Ausdrucken. Auf diesem Gerät ist es auch ohne Internet erreichbar (Notfallseite).</p>
        {sl.zustand === "offen" && (
          <label className="janein"><input type="checkbox" checked={mitNummern} onChange={(e) => setMitNummern(e.target.checked)} /><span>Nummern aus dem Tresor anzeigen (nicht ausdrucken und nicht weitergeben)</span></label>
        )}
        {nummernAn && <p className="fehler">Mit Nummern – diese Fassung bitte nicht ausdrucken oder als PDF weitergeben.</p>}
        <div className="aktionen">
          <button disabled={!n} onClick={async () => {
            if (!n) return;
            const r = await dateiTeilen(pdf(notfallblattBloecke(n, nummernAn), "Notfallblatt Haushalt"), `notfallblatt-${n.stand}.pdf`, "application/pdf");
            setMeldung(r === "geladen" ? "PDF gespeichert (Downloads)." : r === "geteilt" ? "" : "Abgebrochen.");
          }}>Als PDF (drucken, sichern, teilen)</button>
          <button className="zweitrangig" onClick={() => window.print()}>Seite drucken</button>
        </div>
        <p className="leise">Auf dem iPhone öffnet sich das Teilen-Menü – dort „Drucken“ oder „In Dateien sichern“ wählen.</p>
        {meldung && <p className="leise" role="status">{meldung}</p>}
      </section>
      {fehler && <p className="fehler">{fehler}</p>}
      {!n && !fehler && <p className="leise">Wird geladen …</p>}
      {n && (
        <>
          <p className="leise">Stand: {R.fmt(n.stand)}{nummernAn ? " · mit Nummern" : " · ohne Beträge und Nummern"}</p>
          <section className="karte druck-karte">
            <h2>Im Schadenfall zuerst</h2>
            <ol className="punkte" style={{ listStyle: "decimal" }}>{n.sofort.map((t) => <li key={t}>{t}</li>)}</ol>
          </section>
          <Tabelle titel="Versicherungen" zeilen={n.versicherungen} />
          <Tabelle titel="Weitere Verträge" zeilen={n.vertraege} />
          {n.firmen.length > 0 && (
            <section className="karte druck-karte">
              <h2>Weitere Kontakte</h2>
              <ul className="liste">{n.firmen.map((f) => <li key={f.name} className="zeile"><span>{f.name}{f.art ? <span className="leise"> · {f.art}</span> : null}</span><a href={"tel:" + f.hotline.replace(/[^\d+]/g, "")}>{f.hotline}</a></li>)}</ul>
            </section>
          )}
          {n.fristen.length > 0 && (
            <section className="karte druck-karte">
              <h2>Nächste Fristen und Termine</h2>
              <ul className="liste">{n.fristen.map((f) => <li key={f.titel + f.datum} className="zeile"><span>{f.titel}</span><span className="leise">{R.fmt(f.datum)}</span></li>)}</ul>
            </section>
          )}
          <p className="leise">Unterlagen und Zugang: Haushalts-App (Anmeldung mit E-Mail und Passwort). Ohne Gewähr; maßgeblich sind die Verträge selbst.</p>
        </>
      )}
    </main>
  );
}

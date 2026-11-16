"use client";
/* Steuerexport §35a: je Steuerjahr alle Belege mit Markierungen und Summen – als PDF (Teilen/Drucken) oder Excel. Keine Steuerberatung. */
import Link from "next/link";
import { useState } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { HINWEIS, steuerBlaetter, steuerBloecke, steuerJahre, steuerListe } from "@/lib/export/steuer";
import { pdf } from "@/lib/export/pdf";
import { xlsx } from "@/lib/export/xlsx";
import { dateiTeilen } from "@/lib/geraet/teilen";
import * as R from "@/lib/regeln";

const euro = (n: number | null) => (n == null ? "–" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR" }));

export default function Steuer() {
  const { akte, fehler } = useAkte();
  const jahre = akte ? steuerJahre(akte) : [];
  const [wahl, setWahl] = useState("");
  const [meldung, setMeldung] = useState("");
  const jahr = wahl || jahre[0] || "";
  const l = akte ? steuerListe(akte, jahr) : null;

  return (
    <main className="seite">
      <Kopf zurueck="/" text="Übersicht" />
      <h1>Steuerexport §35a</h1>
      {fehler && <p className="fehler">{fehler}</p>}
      {!akte && !fehler && <p className="leise">Wird geladen …</p>}
      {akte && !jahre.length && <section className="karte"><p>Noch keine Belege mit Art „Handwerker“ oder „haushaltsnah“.</p><Link href="/akte/belege">Zu den Belegen</Link></section>}
      {l && jahre.length > 0 && (
        <>
          <section className="karte formular">
            <label><span>Steuerjahr</span><select value={jahr} onChange={(e) => setWahl(e.target.value)}>{jahre.map((j) => <option key={j}>{j}</option>)}</select></label>
            <div className="aktionen">
              <button onClick={async () => { const r = await dateiTeilen(pdf(steuerBloecke(jahr, l), `§35a-Belege ${jahr}`), `35a-belege-${jahr}.pdf`, "application/pdf"); setMeldung(r === "geladen" ? "PDF gespeichert (Downloads)." : ""); }}>Als PDF</button>
              <button className="zweitrangig" onClick={async () => { const r = await dateiTeilen(xlsx(steuerBlaetter(jahr, l)), `35a-belege-${jahr}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); setMeldung(r === "geladen" ? "Excel-Datei gespeichert (Downloads)." : ""); }}>Als Excel</button>
            </div>
            {meldung && <p className="leise" role="status">{meldung}</p>}
          </section>
          {l.summen.map((s) => (
            <section key={s.art} className="karte">
              <h2>{s.art}</h2>
              <div className="zeile"><span>Belege</span><strong>{s.anzahl}</strong></div>
              <div className="zeile"><span>Arbeitskosten</span><strong>{euro(s.arbeit)}</strong></div>
              <div className="zeile"><span>davon unbar bezahlt</span><strong>{euro(s.anrechenbar)}</strong></div>
              <div className="zeile leise"><span>rechnerisch 20 % (Höchstbetrag {euro(s.hoechst)})</span><span>{euro(s.rechnerisch)}</span></div>
              {s.ohneUnbar > 0 && <p className="fehler">{s.ohneUnbar} Beleg(e) nicht als unbar bezahlt markiert – zählen nicht mit.</p>}
              <ul className="liste">
                {l.zeilen.filter((z) => z.art === s.art).map((z) => (
                  <li key={z.datum + z.leistung + z.firma} className="eintrag">
                    <strong>{z.leistung}</strong>
                    <span className="leise">{R.fmt(z.datum)} · {z.firma || "ohne Firma"} · Arbeitskosten {euro(z.arbeitskosten)}{z.unbar ? " · unbar" : ""}</span>
                    {z.hinweise.map((h) => <span key={h} className="fehler">Achtung: {h}</span>)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="leise">{HINWEIS}</p>
        </>
      )}
    </main>
  );
}

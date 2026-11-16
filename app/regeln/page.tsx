"use client";
/* Stand der Fachregeln: Inhalt, Rechtsgrundlage, gilt ab, geprüft am, Quellen; jährliche Erinnerung „Fachregeln prüfen“. */
import { useState } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { GEPRUEFT, REGELN, standText, veraltet } from "@/lib/regeln/stand";
import * as R from "@/lib/regeln";

export default function Regeln() {
  const { akte, haushaltId, neuLaden } = useAkte();
  const [meldung, setMeldung] = useState("");
  const alt = akte ? veraltet(R.heute()) : [];
  const erinnerung = akte?.fristen.some((f) => f.quelle === "regeln" && f.status !== "erledigt");

  return (
    <main className="seite">
      <Kopf zurueck="/" text="Übersicht" />
      <h1>Fachregeln</h1>
      <section className="karte">
        <p className="leise">Nach diesen Regeln rechnet die App Fristen, Gewährleistung und §35a. Ohne Gewähr, keine Rechts- oder Steuerberatung; maßgeblich sind Vertrag und Gesetz. Geprüft per Recherche am {R.fmt(GEPRUEFT)} [prüfen].</p>
        {alt.length > 0 && <p className="fehler">{alt.length} Regel(n) seit über einem Jahr nicht geprüft.</p>}
        {!erinnerung && haushaltId && (
          <button className="zweitrangig" onClick={async () => {
            const { error } = await supabaseBrowser().from("termine").insert({ haushalt_id: haushaltId, titel: "Fachregeln prüfen (Gesetzesänderungen, z. B. §35a)", datum: R.addMonths(GEPRUEFT, 12), wiederholung_monate: 12, quelle: "regeln", notiz: "Übersicht → Fachregeln" });
            setMeldung(error ? "Konnte nicht angelegt werden." : "Jährliche Erinnerung angelegt."); await neuLaden();
          }}>Jährliche Erinnerung „Fachregeln prüfen“ anlegen</button>
        )}
        {erinnerung && <p className="leise">Jährliche Erinnerung ist angelegt (unter Termine).</p>}
        {meldung && <p className="leise" role="status">{meldung}</p>}
      </section>
      {Object.entries(REGELN).map(([k, r]) => (
        <section key={k} id={k} className="karte">
          <div className="zeile"><h2>{r.name}</h2><span className="marke">{standText(r)}</span></div>
          <p>{r.inhalt}</p>
          <p className="leise"><strong>Grundlage:</strong> {r.grundlage}</p>
          <p className="leise"><strong>Gilt ab:</strong> {R.fmt(r.giltAb)} [prüfen] · <strong>Geprüft am:</strong> {R.fmt(r.geprueftAm)}</p>
          {r.hinweis && <p className={r.hinweis.startsWith("Geplant") ? "fehler" : "leise"}>{r.hinweis}</p>}
          <p className="leise">Quellen: {r.quellen.map((q, i) => <span key={q}>{i > 0 && ", "}<a href={q} target="_blank" rel="noreferrer">{new URL(q).hostname}</a></span>)}</p>
        </section>
      ))}
    </main>
  );
}

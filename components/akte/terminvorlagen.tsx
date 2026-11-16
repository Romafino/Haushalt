"use client";
/* Terminvorlagen: Vorlage wählen, Ding zuordnen, letztes Datum eintragen – der wiederkehrende Termin wird angelegt. */
import { useState } from "react";
import type { Akte } from "@/lib/akte/abbilden";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { freitextPruefen } from "@/lib/akte/freitext";
import { naechstesDatum, VORLAGEN, vorlagenTitel, type Vorlage } from "@/lib/akte/vorlagen";
import * as R from "@/lib/regeln";

export function TerminVorlagen({ akte, haushaltId, onAngelegt }: { akte: Akte; haushaltId: string; onAngelegt: () => Promise<void> }) {
  const [v, setV] = useState<Vorlage | null>(null);
  const [dingId, setDingId] = useState("");
  const [letztes, setLetztes] = useState("");
  const [monate, setMonate] = useState(12);
  const [titel, setTitel] = useState("");
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const dinge = akte.dinge.filter((d) => (d.status ?? "aktiv") === "aktiv" && (!v?.bereich || d.kategorie === v.bereich));
  const waehlen = (x: Vorlage) => { setV(x); setMonate(x.monate); setDingId(""); setLetztes(""); setTitel(vorlagenTitel(x)); setMeldung(""); };
  let naechstes = "";
  try { naechstes = letztes ? naechstesDatum(letztes, monate, R.heute()) : ""; } catch { naechstes = ""; }

  async function anlegen() {
    if (!v || !naechstes) return;
    const f = freitextPruefen(titel, "streng");
    if (f) return setMeldung(f);
    setLaeuft(true);
    const { error } = await supabaseBrowser().from("termine").insert({
      haushalt_id: haushaltId, titel: titel.trim().slice(0, 200), datum: naechstes, wiederholung_monate: monate, ding_id: dingId || null, quelle: "vorlage",
    });
    setLaeuft(false);
    if (error) return setMeldung("Der Termin konnte nicht angelegt werden.");
    setMeldung(`Angelegt: ${titel.trim()} am ${R.fmt(naechstes)}, danach alle ${monate} Monate.`);
    setV(null); await onAngelegt();
  }

  return (
    <section className="karte formular">
      <h2>Vorlagen</h2>
      <div className="schnell">
        {VORLAGEN.map((x) => (
          <button key={x.schluessel} type="button" className={v?.schluessel === x.schluessel ? "klein" : "klein zweitrangig"} onClick={() => waehlen(x)}>{x.titel}</button>
        ))}
      </div>
      {v && (
        <>
          <p className="leise">{v.hinweis} [prüfen]</p>
          {dinge.length > 0 && (
            <label><span>Für</span>
              <select value={dingId} onChange={(e) => { setDingId(e.target.value); setTitel(vorlagenTitel(v, akte.dinge.find((d) => d.id === e.target.value)?.name as string | undefined)); }}>
                <option value="">(kein Ding)</option>
                {dinge.map((d) => <option key={d.id} value={d.id}>{String(d.name)}</option>)}
              </select>
            </label>
          )}
          <label><span>Zuletzt am</span><input type="date" value={letztes} max={R.heute()} onChange={(e) => setLetztes(e.target.value)} /></label>
          <label><span>Rhythmus (Monate)</span><input type="number" min={1} max={120} value={monate} onChange={(e) => setMonate(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} /></label>
          <label><span>Titel</span><input value={titel} maxLength={200} onChange={(e) => setTitel(e.target.value)} /></label>
          <p className="leise">{naechstes ? `Nächster Termin: ${R.fmt(naechstes)} – mit Erinnerung, Push und im Kalender-Abo.` : "Bitte das letzte Datum eintragen."}</p>
          <button disabled={!naechstes || laeuft || titel.trim().length < 2} onClick={anlegen}>Termin anlegen</button>
        </>
      )}
      {meldung && <p className="leise" role="status">{meldung}</p>}
    </section>
  );
}

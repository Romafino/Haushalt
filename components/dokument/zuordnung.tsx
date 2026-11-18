"use client";
/* Zuordnung eines gespeicherten Dokuments ändern: Art, Vertrag, Ding, Firma. Seiten, Text und Steckbrief bleiben unverändert. */
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Akte, Eintrag } from "@/lib/akte/abbilden";
import { auswahl } from "@/components/akte/definitionen";
import { WahlMitEigenem } from "@/components/akte/eigener-wert";
import * as R from "@/lib/regeln";

const sortiert = (l: Eintrag[], feld: string) => l.slice().sort((a, b) => String(a[feld]).localeCompare(String(b[feld]), "de"));

export function DokumentZuordnung({ d, S, haushaltId, onGespeichert }: { d: Eintrag; S: Akte; haushaltId: string; onGespeichert: () => Promise<void> }) {
  const start = { typ: String(d.typ ?? "Brief"), vertragId: String(d.vertragId ?? ""), dingId: String(d.dingId ?? ""), firmaId: String(d.firmaId ?? "") };
  const [w, setW] = useState(start);
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const geaendert = (Object.keys(start) as (keyof typeof start)[]).some((k) => w[k] !== start[k]);
  const setze = (k: keyof typeof start, v: string) => { setW((x) => ({ ...x, [k]: v })); setMeldung(""); };

  async function speichern() {
    setLaeuft(true);
    const { error } = await supabaseBrowser().from("dokumente")
      .update({ typ: w.typ, vertrag_id: w.vertragId || null, ding_id: w.dingId || null, firma_id: w.firmaId || null })
      .eq("id", d.id).eq("haushalt_id", haushaltId);
    setLaeuft(false);
    if (error) return setMeldung("Konnte nicht gespeichert werden.");
    setMeldung("Gespeichert.");
    await onGespeichert();
  }

  const wahl = (k: "vertragId" | "dingId" | "firmaId", text: string, l: Eintrag[], feld: string) => (
    <label>{text}
      <select value={w[k]} onChange={(e) => setze(k, e.target.value)}>
        <option value="">–</option>
        {sortiert(l, feld).map((x) => <option key={x.id} value={x.id}>{String(x[feld])}{x.status && !["aktiv", "gekuendigt"].includes(String(x.status)) ? ` (${String(x.status)})` : ""}</option>)}
      </select>
    </label>
  );

  return (
    <section className="karte formular">
      <h2>Zuordnung</h2>
      <label>Art
        <WahlMitEigenem wert={w.typ} optionen={auswahl(R.listen(S.einst.eigene).typ, w.typ)} setze={(t) => setze("typ", t)} liste="typ" haushaltId={haushaltId} />
      </label>
      {wahl("vertragId", "Vertrag", S.vertraege, "kurzname")}
      {wahl("dingId", "Ding", S.dinge, "name")}
      {wahl("firmaId", "Firma", S.firmen, "name")}
      <p className="leise">Nur die Zuordnung ändert sich; Seiten, Text und Steckbrief bleiben. Gehört das Dokument zu einem Vertrag, erscheint es auch bei dessen Dingen.</p>
      {geaendert && <button type="button" onClick={speichern} disabled={laeuft}>{laeuft ? "Wird gespeichert …" : "Zuordnung speichern"}</button>}
      {meldung && <p className={meldung === "Gespeichert." ? "leise" : "fehler"} role="status">{meldung}</p>}
    </section>
  );
}

"use client";
/* Vorschlag der KI bestätigen: was soll mit dem Dokument zusätzlich passieren? Nichts wird ungefragt angelegt. */
import type { Akte } from "@/lib/akte/abbilden";
import type { Auswahl, Vorschlag } from "@/lib/ki/uebernahme";
import * as R from "@/lib/regeln";
import { SteckbriefListe } from "@/components/dokument/steckbrief";
import { VERL, ZAHLWEISE } from "@/components/akte/definitionen";

const EREIGNIS: Record<string, string> = { nachtrag: "Nachtrag / Tarifwechsel", erhoehung: "Beitrags-/Preiserhöhung", kuendigung: "Kündigung versendet", bestaetigung: "Kündigung bestätigt" };
const SCHUTZ: Record<string, string> = { iban: "IBAN/Konto", geburtsdatum: "Geburtsdatum", gesundheit: "Gesundheitsangaben", ausweis: "Ausweisdaten", policeUngeschwaerzt: "persönliche Daten/Versicherungsnummer" };
const NAMEN: Record<string, string> = {
  name: "Name", art: "Art", telefon: "Telefon", email: "E-Mail", hotline: "Hotline", kurzname: "Kurzname", fuerWen: "Für wen", beitrag: "Beitrag (€)",
  zahlweise: "Zahlweise", abschluss: "Abschluss", beginn: "Beginn", laufzeitende: "Laufzeit bis", fristWert: "Kündigungsfrist", fristEinheit: "Einheit",
  verlaengerung: "Ohne Kündigung", kuendigungsweg: "Kündigungsweg", online: "online abgeschlossen", titel: "Wofür", betrag: "Betrag (€)",
  arbeitskosten: "Arbeitskosten (€)", steuer: "Steuer", unbar: "unbar", gewArt: "Gewährleistung", uebergabe: "Übergabe",
};
const wert = (k: string, w: unknown) =>
  typeof w === "number" ? w.toLocaleString("de-DE") : w === true ? "ja" : /^\d{4}-\d{2}-\d{2}$/.test(String(w)) ? R.fmt(String(w)) : k === "zahlweise" ? ZAHLWEISE[String(w)] ?? String(w) : k === "verlaengerung" ? VERL[String(w)] ?? String(w) : String(w);
const zeige = (o: Record<string, unknown>) => Object.entries(o).filter(([, w]) => w != null && w !== "" && w !== false).map(([k, w]) => `${NAMEN[k] ?? k}: ${wert(k, w)}`).join(" · ");

export function VorschlagPruefen({ v, a, setA, S }: { v: Vorschlag; a: Auswahl; setA: (a: Auswahl) => void; S: Akte }) {
  const schutz = Object.entries(v.datenschutz ?? {}).filter(([, w]) => w === true).map(([k]) => SCHUTZ[k] ?? k);
  const sb = v.steckbrief as Record<string, unknown> | null;
  return (
    <section className="karte formular">
      <h2>Vorschlag der KI</h2>
      {schutz.length > 0 && <p className="fehler">Die KI meldet auf dem Dokument: {schutz.join(", ")}. Bitte die Balken prüfen, bevor du speicherst.</p>}
      {v.unsicher?.length > 0 && <p className="leise">Unsicher: {v.unsicher.join(", ")} – bitte prüfen.</p>}

      <fieldset>
        <legend>Firma</legend>
        {v.firma?.name ? <p className="leise">{zeige(v.firma)}</p> : <p className="leise">Keine Firma erkannt.</p>}
        <select aria-label="Firma" value={a.firma ?? ""} onChange={(e) => setA({ ...a, firma: e.target.value || null })}>
          <option value="">nicht zuordnen</option>
          {v.firma?.name ? <option value="neu">neu anlegen: {String(v.firma.name)}</option> : null}
          {S.firmen.map((f) => <option key={f.id} value={f.id}>{String(f.name)}</option>)}
        </select>
      </fieldset>

      <fieldset>
        <legend>Vertrag</legend>
        {Object.keys(v.vertrag ?? {}).length > 0 ? <p className="leise">{zeige(v.vertrag)}</p> : <p className="leise">Keine Vertragsdaten erkannt.</p>}
        <select aria-label="Vertrag" value={a.vertrag ?? ""} onChange={(e) => setA({ ...a, vertrag: e.target.value || null, ereignisAnwenden: !!e.target.value && e.target.value !== "neu" && !!v.ereignis })}>
          <option value="">nicht zuordnen</option>
          {v.vertrag?.kurzname && v.vertrag?.art ? <option value="neu">neu anlegen: {String(v.vertrag.kurzname)}</option> : null}
          {S.vertraege.map((x) => <option key={x.id} value={x.id}>{String(x.kurzname)}</option>)}
        </select>
        {v.ereignis && a.vertrag && a.vertrag !== "neu" && (
          <label className="janein">
            <input type="checkbox" checked={a.ereignisAnwenden} onChange={(e) => setA({ ...a, ereignisAnwenden: e.target.checked })} />
            <span>Als Ereignis eintragen: {EREIGNIS[v.ereignis] ?? v.ereignis}{v.ereignisDaten?.gueltigAb ? " ab " + R.fmt(v.ereignisDaten.gueltigAb) : ""}{v.ereignisDaten?.zum ? " zum " + R.fmt(v.ereignisDaten.zum) : ""}</span>
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Ding</legend>
        <select aria-label="Ding" value={a.dingId ?? ""} onChange={(e) => setA({ ...a, dingId: e.target.value || null })}>
          <option value="">nicht zuordnen</option>
          {S.dinge.map((d) => <option key={d.id} value={d.id}>{String(d.name)}</option>)}
        </select>
      </fieldset>

      {Object.keys(v.beleg ?? {}).length > 0 && (
        <fieldset>
          <legend>Beleg</legend>
          <p className="leise">{zeige(v.beleg)}</p>
          <label className="janein"><input type="checkbox" checked={a.belegAnlegen} onChange={(e) => setA({ ...a, belegAnlegen: e.target.checked })} /><span>Als Beleg anlegen</span></label>
        </fieldset>
      )}

      {sb && (
        <details>
          <summary>Steckbrief (wird am Dokument gespeichert)</summary>
          <SteckbriefListe sb={sb} />
        </details>
      )}
      <p className="leise">Vorschlag ohne Gewähr. „Nicht gefunden“ heißt unklar, nicht „nicht versichert“. Keine Rechts- oder Steuerberatung.</p>
    </section>
  );
}

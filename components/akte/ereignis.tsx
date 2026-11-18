"use client";
/* Ereignis an einem Vertrag eintragen: Eingabe → Vorschau der Folgen (Regelmodul) → in einer Transaktion übernehmen. */
import { useState } from "react";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { mitKundennummer } from "@/lib/schwaerzen/tresor";
import type { Akte, Eintrag } from "@/lib/akte/abbilden";
import { opsUebersetzen } from "@/lib/akte/ops";
import { opsAnwenden } from "@/lib/akte/useAkte";
import * as R from "@/lib/regeln";
import { auswahl, VERL, ZAHLWEISE } from "./definitionen";
import { WahlMitEigenem } from "./eigener-wert";
import { freitextPruefen } from "@/lib/akte/freitext";
import { listenTreffer } from "@/lib/schwaerzen/seitentext";

type Typ = "erhoehung" | "nachtrag" | "kuendigung" | "bestaetigung" | "ersatz" | "eigen";
const NAMEN: Record<Typ, string> = {
  erhoehung: "Beitrags-/Preiserhöhung", nachtrag: "Nachtrag / Tarifwechsel", kuendigung: "Kündigung versendet",
  bestaetigung: "Kündigung bestätigt", ersatz: "Ersatzvertrag verknüpfen", eigen: "Anderes Ereignis (eigene Angabe) …",
};
const ZAHLWEISEN = R.ENUM.zahlweise;

export function EreignisEintragen({ v, S, haushaltId, onGeaendert }: { v: Eintrag; S: Akte; haushaltId: string; onGeaendert: () => Promise<void> }) {
  const heute: string = R.heute();
  const moeglich: Typ[] = [...(v.status === "aktiv" ? ["erhoehung", "nachtrag", "kuendigung", "ersatz"] as Typ[] : v.status === "gekuendigt" ? ["bestaetigung", "ersatz"] as Typ[] : []), "eigen"];
  const sl = useSchwaerzliste();
  const eigeneEreignisse: string[] = R.listen(S.einst.eigene).ereignis;
  const kj = R.kuendigungJetzt(v, heute);
  const [typ, setTyp] = useState<Typ | "">("");
  const [w, setW] = useState<Record<string, string>>({});
  const [vorschau, setVorschau] = useState<{ text: string; hinweise: string[]; ops: unknown[] } | null>(null);
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  if (!moeglich.length) return null;

  const setze = (k: string, x: string) => { setW((a) => ({ ...a, [k]: x })); setVorschau(null); };
  const waehle = (t: Typ | "") => {
    setTyp(t); setVorschau(null); setMeldung("");
    setW(t === "eigen" ? { datum: heute } : t === "kuendigung" ? { am: heute, zum: kj?.zum ?? String(v.laufzeitende ?? "") } : t === "bestaetigung" ? { zum: String(v.gekuendigtZum ?? v.laufzeitende ?? "") } : t === "erhoehung" ? { zugang: heute, zahlweise: String(v.zahlweise ?? "") } : {});
  };
  const zahl = (x?: string) => (x ? Number(x.replace(",", ".")) : NaN);

  function ereignisDaten(): Record<string, unknown> | string {
    if (typ === "erhoehung") {
      if (!Number.isFinite(zahl(w.beitrag)) || !w.gueltigAb) return "Bitte neuen Beitrag und „gültig ab“ angeben.";
      return { beitrag: zahl(w.beitrag), zahlweise: w.zahlweise || undefined, gueltigAb: w.gueltigAb, zugang: w.zugang || heute };
    }
    if (typ === "nachtrag") {
      if (!w.gueltigAb) return "Bitte „gültig ab“ angeben.";
      const e: Record<string, unknown> = { gueltigAb: w.gueltigAb };
      if (w.beitrag) e.beitrag = zahl(w.beitrag);
      for (const k of ["zahlweise", "laufzeitende", "fristEinheit", "verlaengerung"]) if (w[k]) e[k] = w[k];
      if (w.fristWert) e.fristWert = zahl(w.fristWert);
      if (Object.keys(e).length === 1) return "Bitte mindestens einen neuen Wert angeben.";
      if (Object.values(e).some((x) => typeof x === "number" && !Number.isFinite(x))) return "Bitte Zahlen prüfen.";
      return e;
    }
    if (typ === "kuendigung") return w.zum ? { am: w.am || heute, zum: w.zum } : "Bitte „gekündigt zum“ angeben.";
    if (typ === "bestaetigung") return w.zum ? { zum: w.zum } : "Bitte das bestätigte Vertragsende angeben.";
    if (typ === "ersatz") return w.ersatzId ? { ersatzId: w.ersatzId } : "Bitte den Ersatzvertrag wählen.";
    if (typ === "eigen") {
      if (!w.was) return "Bitte angeben, was passiert ist.";
      if (!w.datum) return "Bitte das Datum angeben.";
      const f = freitextPruefen(w.notiz ?? "", "streng", sl.zustand === "offen" ? sl.liste : null) ?? (listenTreffer(w.notiz ?? "", sl.liste).length ? "Bitte keine Namen oder Angaben aus der Schwärzliste in die Notiz." : null);
      return f ?? { was: w.was, datum: w.datum, notiz: (w.notiz ?? "").trim() };
    }
    return "Bitte ein Ereignis wählen.";
  }

  function zeigeVorschau() {
    setMeldung("");
    const e = ereignisDaten();
    if (typeof e === "string") return setMeldung(e);
    if (typ === "eigen") {
      // Eigenes Ereignis: nur ein Eintrag in der Zeitleiste, keine automatischen Folgen
      const text = String(e.was) + (e.notiz ? ": " + String(e.notiz) : "");
      return setVorschau({ text: "Eintrag in der Zeitleiste am " + R.fmt(String(e.datum)) + ": " + text, hinweise: ["Keine automatischen Folgen (Beitrag, Fristen, Status bleiben unverändert)."],
        ops: [{ op: "add", col: "ereignisse", data: { datum: e.datum, typ: "eigen", text: text.slice(0, 2000), vertragId: v.id } }] });
    }
    const f = R.ereignisFolgen(typ, v, e, S, heute);
    setVorschau({ text: f.text, hinweise: f.hinweise, ops: f.ops });
  }

  async function uebernehmen() {
    if (!vorschau) return;
    setLaeuft(true);
    try {
      await opsAnwenden(haushaltId, opsUebersetzen(vorschau.ops as never, S));
      setVorschau(null); setTyp(""); setMeldung("Übernommen.");
      await onGeaendert();
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : "Hat nicht geklappt.");
    }
    setLaeuft(false);
  }

  const feld = (k: string, text: string, art: "date" | "text" = "date", modus?: "decimal" | "numeric") => (
    <label>{text}<input type={art} inputMode={modus} value={w[k] ?? ""} onChange={(e) => setze(k, e.target.value)} /></label>
  );
  const wahl = (k: string, text: string, l: string[], texte: Record<string, string> = {}) => (
    <label>{text}<select value={w[k] ?? ""} onChange={(e) => setze(k, e.target.value)}><option value="">–</option>{l.map((x) => <option key={x} value={x}>{texte[x] ?? x}</option>)}</select></label>
  );

  return (
    <section className="karte">
      <h2>Ereignis eintragen</h2>
      <label>Was ist passiert?
        <select value={typ} onChange={(e) => waehle(e.target.value as Typ | "")}>
          <option value="">bitte wählen</option>
          {moeglich.map((t) => <option key={t} value={t}>{NAMEN[t]}</option>)}
        </select>
      </label>
      {typ === "erhoehung" && <>{feld("beitrag", "Neuer Beitrag (€)", "text", "decimal")}{wahl("zahlweise", "Zahlweise", ZAHLWEISEN, ZAHLWEISE)}{feld("gueltigAb", "Gültig ab")}{feld("zugang", "Mitteilung erhalten am")}</>}
      {typ === "nachtrag" && <>{feld("gueltigAb", "Gültig ab")}<p className="leise">Nur ausfüllen, was sich ändert:</p>{feld("beitrag", "Beitrag (€)", "text", "decimal")}{wahl("zahlweise", "Zahlweise", ZAHLWEISEN, ZAHLWEISE)}{feld("laufzeitende", "Laufzeit bis")}{feld("fristWert", "Kündigungsfrist", "text", "numeric")}{wahl("fristEinheit", "Einheit", R.ENUM.einheit)}{wahl("verlaengerung", "Ohne Kündigung", R.ENUM.verl, VERL)}</>}
      {typ === "kuendigung" && <>{feld("am", "Versendet am")}{feld("zum", "Gekündigt zum")}<p className="leise">Es zählt der Zugang beim Anbieter. Versand mit Nachweis.</p></>}
      {typ === "bestaetigung" && feld("zum", "Bestätigtes Vertragsende")}
      {typ === "eigen" && <>
        <label>Was ist passiert?
          <WahlMitEigenem wert={w.was ?? ""} leer="bitte wählen oder eigenen Wert anlegen" optionen={auswahl(eigeneEreignisse, w.was)} setze={(x) => setze("was", x)} liste="ereignis" haushaltId={haushaltId} />
        </label>
        {feld("datum", "Datum")}
        <label>Notiz (optional)<textarea rows={2} maxLength={1500} value={w.notiz ?? ""} onChange={(e) => setze("notiz", e.target.value)} /></label>
      </>}
      {typ === "ersatz" && (
        <label>Ersatzvertrag
          <select value={w.ersatzId ?? ""} onChange={(e) => setze("ersatzId", e.target.value)}>
            <option value="">–</option>
            {S.vertraege.filter((x) => x.id !== v.id).map((x) => <option key={x.id} value={x.id}>{String(x.kurzname)}</option>)}
          </select>
        </label>
      )}
      {typ && !vorschau && <button type="button" className="zweitrangig" onClick={zeigeVorschau}>Vorschau: Was passiert?</button>}
      {vorschau && (
        <div className="vorschau">
          <strong>{vorschau.text}</strong>
          <ul>{vorschau.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
          <div className="knoepfe">
            <button type="button" onClick={uebernehmen} disabled={laeuft}>{laeuft ? "Wird übernommen …" : "Übernehmen"}</button>
            <button type="button" className="zweitrangig" onClick={() => setVorschau(null)}>Ändern</button>
          </div>
        </div>
      )}
      {meldung && <p className={meldung === "Übernommen." ? "leise" : "fehler"} role="status">{meldung}</p>}
    </section>
  );
}

export function Kuendigungsentwurf({ v, S }: { v: Eintrag; S: Akte }) {
  const [kopiert, setKopiert] = useState(false);
  const sl = useSchwaerzliste();
  if (v.status !== "aktiv") return null;
  const heute: string = R.heute();
  const firma = S.firmen.find((f) => f.id === v.firmaId);
  const vorlage = (S.einst.texte as Record<string, unknown> | undefined)?.kuendigung;
  // [Kundennummer] füllt der Tresor – nur hier auf dem Gerät, der Text wird nicht gespeichert
  const text: string = mitKundennummer(R.kuendigungsText(v, firma, heute, vorlage), sl.nummern[v.id]);
  return (
    <details className="karte">
      <summary>Kündigungsentwurf</summary>
      <p className="leise">[Name] und [Adresse]{text.includes("[Kundennummer]") ? " und [Kundennummer]" : ""} selbst einsetzen. Es zählt der Zugang beim Anbieter, Versand mit Nachweis.{v.online ? " Online abgeschlossen: Der Anbieter muss einen Kündigungsbutton anbieten." : ""}</p>
      <textarea readOnly rows={14} value={text} />
      <button type="button" className="zweitrangig" onClick={async () => { await navigator.clipboard.writeText(text); setKopiert(true); }}>{kopiert ? "Kopiert" : "Text kopieren"}</button>
    </details>
  );
}

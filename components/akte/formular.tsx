"use client";
import { useState, type FormEvent } from "react";
import type { Akte, Eintrag } from "@/lib/akte/abbilden";
import { freitextPruefen } from "@/lib/akte/freitext";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { auswahl, type Bereich, type Feld } from "./definitionen";
import { EigenEingabe, WahlMitEigenem } from "./eigener-wert";
import * as R from "@/lib/regeln";

type Werte = Record<string, string | boolean>;
export type Bezuege = { dinge: string[]; rollen: string[] };

const anzeigen = (v: unknown): string | boolean => (typeof v === "boolean" ? v : v == null ? "" : String(v));

/** Formularwerte → Eintrag: Zahlen als number, leere Felder als null (leert das Feld beim Speichern). */
function umwandeln(felder: Feld[], w: Werte): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of felder) {
    const x = w[f.name];
    if (f.art === "janein") out[f.name] = x === true;
    else if (x === "" || x == null) out[f.name] = null;
    else if (f.art === "zahl" || f.art === "euro") out[f.name] = Number(String(x).replace(",", "."));
    else out[f.name] = typeof x === "string" ? x.trim() : x;
  }
  return out;
}

export function Formular({ bereich, start, akte, mitBezuegen, onSpeichern, eigeneId, haushaltId }: {
  bereich: Bereich;
  haushaltId?: string;
  start: Record<string, unknown>;
  akte: Akte;
  mitBezuegen?: Bezuege;
  eigeneId?: string;
  /** null = gespeichert; string = Fehler; { hinweis } = gespeichert mit Hinweis */
  onSpeichern: (werte: Record<string, unknown>, bezuege?: Bezuege) => Promise<string | null | { hinweis: string }>;
}) {
  const [werte, setWerte] = useState<Werte>(() => Object.fromEntries(bereich.felder.map((f) => [f.name, anzeigen(start[f.name])])));
  const [bez, setBez] = useState<Bezuege | undefined>(mitBezuegen);
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState("");
  const [ok, setOk] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const setze = (n: string, v: string | boolean) => setWerte((w) => ({ ...w, [n]: v }));
  const sl = useSchwaerzliste();
  const listen = R.listen(akte.einst.eigene);
  const optionenFuer = (f: Feld) => {
    const l: Eintrag[] = f.verweis ? (akte[f.verweis] as Eintrag[]) : [];
    return l.filter((x) => x.id !== eigeneId).map((x) => ({ wert: x.id, text: String(x.name ?? x.kurzname ?? x.titel) }))
      .sort((a, b) => a.text.localeCompare(b.text, "de"));
  };

  async function absenden(e: FormEvent) {
    e.preventDefault();
    const neu: Record<string, string> = {};
    for (const f of bereich.felder) {
      const x = werte[f.name];
      if (f.pflicht && (x === "" || x == null)) neu[f.name] = "Bitte ausfüllen.";
      const p = freitextPruefen(x, f.pruefung ?? "keine", sl.zustand === "offen" ? sl.liste : null);
      if (p) neu[f.name] = p;
      if ((f.art === "zahl" || f.art === "euro") && x !== "" && !Number.isFinite(Number(String(x).replace(",", ".")))) neu[f.name] = "Bitte eine Zahl eingeben.";
    }
    setFehler(neu);
    setMeldung("");
    setOk(false);
    if (Object.keys(neu).length) return setMeldung("Bitte die markierten Felder prüfen.");
    setLaeuft(true);
    const f = await onSpeichern(umwandeln(bereich.felder, werte), bez);
    setLaeuft(false);
    setOk(typeof f !== "string");
    setMeldung(f === null ? "Gespeichert." : typeof f === "string" ? f : "Gespeichert. " + f.hinweis);
  }

  const gruppen = Array.from(new Set(bereich.felder.map((f) => f.gruppe ?? "")));
  return (
    <form className="karte formular" onSubmit={absenden} noValidate>
      {gruppen.map((g) => (
        <fieldset key={g || "allgemein"}>
          {g && <legend>{g}</legend>}
          {bereich.felder.filter((f) => (f.gruppe ?? "") === g).map((f) => (
            <FeldEingabe key={f.name} haushaltId={haushaltId} f={f} wert={werte[f.name]} fehler={fehler[f.name]} setze={setze} optionen={f.verweis ? optionenFuer(f) : f.liste ? auswahl(listen[f.liste], werte[f.name]) : f.optionen ?? []} />
          ))}
        </fieldset>
      ))}

      {bez && (
        <fieldset>
          <legend>Bezüge</legend>
          <Mehrfach titel="Betrifft diese Dinge" alle={akte.dinge.map((d) => ({ wert: d.id, text: String(d.name) }))} gewaehlt={bez.dinge} setze={(l) => setBez({ ...bez, dinge: l })} />
          <Mehrfach titel="Für wen" alle={[...listen.rolle, ...(bez.rollen ?? []).filter((r) => !listen.rolle.includes(r))].map((r) => ({ wert: r, text: r }))} gewaehlt={bez.rollen} setze={(l) => setBez({ ...bez, rollen: l })} />
          <EigenEingabe liste="rolle" haushaltId={haushaltId} knopf="＋ Eigene Rolle …" onWert={(r) => setBez({ ...bez, rollen: bez.rollen.includes(r) ? bez.rollen : [...bez.rollen, r] })} />
          <p className="leise">Das zuerst gewählte ist jeweils der Hauptbezug.</p>
        </fieldset>
      )}

      {meldung && <p className={ok ? "leise" : "fehler"} role="status">{meldung}</p>}
      <button type="submit" disabled={laeuft}>{laeuft ? "Wird gespeichert …" : "Speichern"}</button>
    </form>
  );
}

function FeldEingabe({ f, wert, fehler, setze, optionen, haushaltId }: { f: Feld; wert: string | boolean; fehler?: string; setze: (n: string, v: string | boolean) => void; optionen: { wert: string; text: string }[]; haushaltId?: string }) {
  const id = "feld-" + f.name;
  const gemeinsam = { id, name: f.name, "aria-invalid": !!fehler, "aria-describedby": fehler || f.hilfe ? id + "-hinweis" : undefined };
  let eingabe;
  if (f.art === "janein") {
    return (
      <label className="janein">
        <input type="checkbox" {...gemeinsam} checked={wert === true} onChange={(e) => setze(f.name, e.target.checked)} />
        <span>{f.text}</span>
      </label>
    );
  } else if (f.art === "wahl" && f.liste) {
    eingabe = <WahlMitEigenem id={id} invalid={!!fehler} beschrieben={gemeinsam["aria-describedby"]} wert={String(wert)} optionen={optionen}
      leer={f.pflicht ? undefined : "–"} setze={(w) => setze(f.name, w)} liste={f.liste} haushaltId={haushaltId} />;
  } else if (f.art === "wahl" || f.art === "verweis") {
    eingabe = (
      <select {...gemeinsam} value={String(wert)} onChange={(e) => setze(f.name, e.target.value)}>
        {!f.pflicht && <option value="">–</option>}
        {optionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}
      </select>
    );
  } else if (f.art === "notiz") {
    eingabe = <textarea {...gemeinsam} rows={3} maxLength={2000} value={String(wert)} onChange={(e) => setze(f.name, e.target.value)} />;
  } else {
    const typ = { datum: "date", email: "email", tel: "tel", web: "url", zahl: "text", euro: "text", text: "text" }[f.art];
    const modus = f.art === "euro" ? "decimal" : f.art === "zahl" ? "numeric" : undefined;
    eingabe = <input {...gemeinsam} type={typ} inputMode={modus} value={String(wert)} onChange={(e) => setze(f.name, e.target.value)} />;
  }
  return (
    <label htmlFor={id}>
      {f.text}{f.pflicht ? " *" : ""}{f.art === "euro" ? " (€)" : ""}
      {eingabe}
      {(fehler || f.hilfe) && <span id={id + "-hinweis"} className={fehler ? "fehler" : "leise"}>{fehler ?? f.hilfe}</span>}
    </label>
  );
}

function Mehrfach({ titel, alle, gewaehlt, setze }: { titel: string; alle: { wert: string; text: string }[]; gewaehlt: string[]; setze: (l: string[]) => void }) {
  if (!alle.length) return <p className="leise">{titel}: noch nichts angelegt.</p>;
  return (
    <div className="mehrfach" role="group" aria-label={titel}>
      <span>{titel}</span>
      <div className="chips">
        {alle.map((o) => {
          const an = gewaehlt.includes(o.wert);
          return (
            <button key={o.wert} type="button" className={an ? "chip an" : "chip"} aria-pressed={an}
              onClick={() => setze(an ? gewaehlt.filter((x) => x !== o.wert) : [...gewaehlt, o.wert])}>
              {gewaehlt[0] === o.wert ? "★ " : ""}{o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

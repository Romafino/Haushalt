"use client";
/* Schaden erfassen: Beschreibung wird auf dem Gerät gegen die Schwärzliste ersetzt; je Police, die am Schadentag galt, prüft die KI.
   Gespeichert wird erst nach Bestätigung, alles in einer Transaktion. Fotos kommen danach auf der Seite des Falls dazu (nie an die KI). */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { useAkte } from "@/lib/akte/useAkte";
import { schadenAnlegen, schadenPruefen } from "@/lib/geraet/schaden";
import { pruefungAus, type Pruefung } from "@/lib/ki/schaden";
import { PruefungKarte } from "@/components/schaden/pruefung";
import { anonymisieren } from "@/lib/schwaerzen";
import { textSauber } from "@/lib/ki/antwort";
import * as R from "@/lib/regeln";

export default function SchadenNeu() {
  const router = useRouter();
  const sl = useSchwaerzliste();
  const { akte, haushaltId, fehler: ladeFehler } = useAkte();
  const [datum, setDatum] = useState("");
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [dinge, setDinge] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [fehler, setFehler] = useState("");
  const [erg, setErg] = useState<{ beschreibung: string; titel: string; pruefungen: Pruefung[]; kostenCent: number; warnung: string } | null>(null);

  useEffect(() => { if (sl.zustand === "unbekannt") void sl.pruefen(); }, [sl]);
  // Datum erst im Browser setzen (nicht beim Vorab-Rendern)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDatum((d) => d || R.heute()); }, []);

  const gueltig = datum && titel.trim().length >= 3 && beschreibung.trim().length >= 5;
  const policen = akte && datum ? (R.schadenPolicen(akte, datum) as Record<string, unknown>[]) : [];

  async function pruefen(e: FormEvent) {
    e.preventDefault();
    if (!akte || !haushaltId || !gueltig) return setFehler("Bitte Schadentag, kurze Bezeichnung und Beschreibung angeben.");
    setFehler(""); setErg(null);
    try { setErg(await schadenPruefen(haushaltId, akte, { datum, titel, beschreibung, dingIds: dinge }, sl.liste, setStatus)); }
    catch (err) { setFehler(err instanceof Error ? err.message : "Die Prüfung hat nicht geklappt."); }
    setStatus("");
  }

  function ohneKi() {
    if (!akte || !gueltig) return setFehler("Bitte Schadentag, kurze Bezeichnung und Beschreibung angeben.");
    const weg = (t: string) => textSauber(anonymisieren(t, sl.liste).text);
    setErg({ beschreibung: weg(beschreibung), titel: weg(titel), pruefungen: policen.map((p) => ({ ...pruefungAus({ ...p, steckbrief: null }, null), begruendung: "Nicht durch die KI geprüft. Bitte selbst in den Bedingungen nachsehen." })), kostenCent: 0, warnung: "" });
  }

  async function speichern() {
    if (!erg || !haushaltId) return;
    setStatus("Wird gespeichert …");
    try { const id = await schadenAnlegen(haushaltId, { datum, titel: erg.titel, beschreibung: erg.beschreibung }, dinge, erg.pruefungen); router.push(`/schaden/${id}`); }
    catch (err) { setFehler(err instanceof Error ? err.message : "Speichern hat nicht geklappt."); setStatus(""); }
  }

  if (sl.zustand !== "offen") {
    return (
      <main className="seite">
        <Kopf zurueck="/schaden" text="Schadenfall" />
        <h1>Schaden erfassen</h1>
        <section className="karte">
          <p>{sl.zustand === "keine" ? "Bitte zuerst die Schwärzliste anlegen." : sl.zustand === "gesperrt" ? "Bitte zuerst die Schwärzliste entsperren." : "Schwärzliste wird geprüft …"}</p>
          <p className="leise">Sonst würden Namen in der Beschreibung nicht ersetzt. Sofortmaßnahmen und Hotlines stehen auf der Seite „Schadenfall“.</p>
          {(sl.zustand === "keine" || sl.zustand === "gesperrt") && <Link className="knopf" href="/schwaerzliste">Zur Schwärzliste</Link>}
        </section>
      </main>
    );
  }

  return (
    <main className="seite">
      <Kopf zurueck="/schaden" text="Schadenfall" />
      <h1>Schaden erfassen</h1>
      <form className="karte formular" onSubmit={pruefen}>
        <label><span>Schadentag *</span><input type="date" value={datum} max={R.heute()} onChange={(e) => { setDatum(e.target.value); setErg(null); }} /></label>
        <label><span>Kurz: was ist passiert? *</span><input value={titel} maxLength={120} placeholder="z. B. Wasserschaden Keller" onChange={(e) => { setTitel(e.target.value); setErg(null); }} /></label>
        <label><span>Beschreibung *</span><textarea rows={5} value={beschreibung} maxLength={5000} placeholder="Was ist passiert? Wo? Was ist beschädigt?" onChange={(e) => { setBeschreibung(e.target.value); setErg(null); }} /></label>
        {!!akte?.dinge.length && (
          <fieldset>
            <legend>Betroffene Dinge</legend>
            {akte.dinge.filter((d) => (d.status ?? "aktiv") === "aktiv").map((d) => (
              <label key={d.id} className="janein">
                <input type="checkbox" checked={dinge.includes(d.id)} onChange={(e) => { setDinge(e.target.checked ? [...dinge, d.id] : dinge.filter((x) => x !== d.id)); setErg(null); }} />
                <span>{String(d.name)}</span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="leise">
          {policen.length ? `Geprüft werden ${policen.length} ${policen.length === 1 ? "Police" : "Policen"}, die am ${R.fmt(datum)} in Kraft ${policen.length === 1 ? "war" : "waren"} – jede einzeln in der damals gültigen Fassung.` : "Am Schadentag war keine Versicherung in Kraft."}
          {" "}An die KI gehen nur die geschwärzte Beschreibung, Steckbriefe und passende geschwärzte Seiten; Fotos nie.
        </p>
        {!erg && <div className="aktionen">
          <button type="submit" disabled={!akte || !!status || !gueltig || !policen.length}>{status ? "Läuft …" : "Prüfen lassen"}</button>
          <button type="button" className="zweitrangig" disabled={!akte || !!status || !gueltig} onClick={ohneKi}>Ohne KI anlegen</button>
        </div>}
        {status && <p className="leise" role="status">{status}</p>}
        {(fehler || ladeFehler) && <p className="fehler" role="alert">{fehler || ladeFehler}</p>}
      </form>

      {erg && (
        <>
          {erg.warnung && <p className="fehler">{erg.warnung}</p>}
          {erg.pruefungen.map((p) => <PruefungKarte key={p.vertragId} p={p} />)}
          <p className="leise">Ohne Gewähr. „Unklar“ heißt: in den gespeicherten Unterlagen nicht eindeutig gefunden – nicht „nicht versichert“. Keine Rechtsberatung, keine Aussage zur Höhe einer Zahlung.{erg.kostenCent ? ` KI-Kosten: ${(erg.kostenCent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 3 })}.` : ""}</p>
          <div className="aktionen">
            <button type="button" onClick={speichern} disabled={!!status}>Schadenfall anlegen</button>
            <button type="button" className="zweitrangig" onClick={() => setErg(null)} disabled={!!status}>Ändern</button>
          </div>
        </>
      )}
    </main>
  );
}

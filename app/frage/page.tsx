"use client";
/* Frag die Akte: Frage → auf dem Gerät gegen die Schwärzliste ersetzen → Seiten suchen → KI antwortet mit Quellen.
   Namen werden erst hier in der Anzeige wieder eingesetzt; an die KI und auf den Server gehen nur Platzhalter. */
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { useAkte } from "@/lib/akte/useAkte";
import { fragen, frageSpeichern, tochterFassung, type FrageErgebnis } from "@/lib/geraet/frage";
import { GespeicherteFragen } from "@/components/gespeicherte-fragen";
import { zurueckuebersetzen } from "@/lib/ki/frage";
import { frageHolen } from "@/lib/geraet/frage-entwurf";
import * as R from "@/lib/regeln";

export default function Frage() {
  const sl = useSchwaerzliste();
  const { akte, haushaltId, fehler: ladeFehler } = useAkte();
  const [frage, setFrage] = useState("");
  const [status, setStatus] = useState("");
  const [fehler, setFehler] = useState("");
  const [erg, setErg] = useState<FrageErgebnis | null>(null);
  const [namen, setNamen] = useState(true);
  const [kopiert, setKopiert] = useState(false);
  const [tochter, setTochter] = useState<{ text: string; warnung?: string } | null>(null);
  const [tochterLaeuft, setTochterLaeuft] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [neuGeladen, setNeuGeladen] = useState(0);

  useEffect(() => {
    if (sl.zustand === "unbekannt") void sl.pruefen();
  }, [sl]);

  async function starten(text: string) {
    if (!akte || !haushaltId || status) return;
    if (text.trim().length < 3) return setFehler("Bitte eine Frage eingeben.");
    setFehler(""); setErg(null); setKopiert(false); setTochter(null); setGespeichert(false);
    try {
      setErg(await fragen(haushaltId, text, sl.liste, akte, setStatus));
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    }
    setStatus("");
  }
  function absenden(e: FormEvent) {
    e.preventDefault();
    void starten(frage);
  }

  // Frage von der Startseite: erst übernehmen, wenn Schwärzliste offen und Akte geladen ist (sonst bleibt sie gemerkt)
  const uebernommen = useRef(false);
  useEffect(() => {
    if (uebernommen.current || sl.zustand !== "offen" || !akte || !haushaltId) return;
    uebernommen.current = true;
    const t = frageHolen();
    if (!t) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrage(t);
    void starten(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sl.zustand, akte, haushaltId]);

  if (sl.zustand !== "offen") {
    return (
      <main className="seite">
        <Kopf zurueck="/" text="Übersicht" />
        <h1>Frag die Akte</h1>
        <section className="karte">
          <p>{sl.zustand === "keine" ? "Bitte zuerst die Schwärzliste anlegen." : sl.zustand === "gesperrt" ? "Bitte zuerst die Schwärzliste entsperren." : "Schwärzliste wird geprüft …"}</p>
          <p className="leise">Ohne Schwärzliste würden Namen in der Frage nicht ersetzt.</p>
          {(sl.zustand === "keine" || sl.zustand === "gesperrt") && <Link className="knopf" href="/schwaerzliste">Zur Schwärzliste</Link>}
        </section>
      </main>
    );
  }

  const anzeige = erg ? (namen ? zurueckuebersetzen(erg.antwort, sl.liste) : erg.antwort) : "";
  const gelesen = erg ? Array.from(new Map(erg.gelesen.map((g) => [g.dokumentId, { ...g, seiten: erg.gelesen.filter((x) => x.dokumentId === g.dokumentId).map((x) => x.nr) }])).values()) : [];
  return (
    <main className="seite">
      <Kopf zurueck="/" text="Übersicht" />
      <h1>Frag die Akte</h1>
      <form className="karte formular" onSubmit={absenden}>
        <label>
          <span>Deine Frage</span>
          <textarea rows={3} value={frage} onChange={(e) => setFrage(e.target.value)} placeholder="z. B. Ist mein Fahrrad gegen Diebstahl versichert?" maxLength={1000} />
        </label>
        <p className="leise">Tipp: Diktieren geht über das Mikrofon der Tastatur. Ein Datum in der Frage (z. B. 15.06.2025) prüft den Stand von damals.</p>
        <button type="submit" disabled={!akte || !!status}>{status ? "Läuft …" : "Fragen"}</button>
        {status && <p className="leise" role="status">{status}</p>}
        {(fehler || ladeFehler) && <p className="fehler" role="alert">{fehler || ladeFehler}</p>}
      </form>

      {erg && (
        <section className="karte">
          <h2>Antwort</h2>
          {erg.warnung && <p className="fehler">{erg.warnung}</p>}
          <p className="antwort" style={{ whiteSpace: "pre-wrap" }}>{anzeige}</p>
          <p className="leise">
            Stand: {R.fmt(erg.stichtag)}{erg.stichtag === R.heute() ? " (heute, nur laufende Verträge)" : " (damals gültige Fassung)"}.
            {" "}Gelesen:{" "}
            {gelesen.length ? gelesen.map((g, i) => (
              <span key={g.dokumentId}>{i > 0 && "; "}<Link href={`/dokumente/${g.dokumentId}`}>{g.titel}</Link> S. {g.seiten.join(", ")}</span>
            )) : "nur Einträge und Steckbriefe"}.
          </p>
          <label className="janein"><input type="checkbox" checked={namen} onChange={(e) => setNamen(e.target.checked)} /><span>Namen statt Platzhalter anzeigen und kopieren (nur auf diesem Gerät)</span></label>
          <button type="button" className="zweitrangig" onClick={async () => { try { await navigator.clipboard.writeText(anzeige); setKopiert(true); } catch { setKopiert(false); } }}>{kopiert ? "Kopiert" : "Text kopieren"}</button>
          <div className="aktionen">
            <button type="button" className="zweitrangig" disabled={tochterLaeuft || !!tochter} onClick={async () => {
              if (!haushaltId) return;
              setTochterLaeuft(true); setFehler("");
              try { const t = await tochterFassung(haushaltId, erg, sl.liste); setTochter(t); setErg({ ...erg, kostenCent: erg.kostenCent + t.kostenCent }); }
              catch (err) { setFehler(err instanceof Error ? err.message : "Das hat nicht geklappt."); }
              setTochterLaeuft(false);
            }}>{tochterLaeuft ? "Wird umformuliert …" : "Für Tochter"}</button>
            <button type="button" disabled={gespeichert} onClick={async () => {
              if (!haushaltId) return;
              const f = await frageSpeichern(haushaltId, erg, tochter?.text ?? null, sl.liste);
              if (f) setFehler(f); else { setGespeichert(true); setNeuGeladen((n) => n + 1); }
            }}>{gespeichert ? "In der Akte" : "Zur Akte"}</button>
          </div>
          {tochter && (
            <div className="karte">
              <h3>Für Tochter</h3>
              {tochter.warnung && <p className="fehler">{tochter.warnung}</p>}
              <p style={{ whiteSpace: "pre-wrap" }}>{namen ? zurueckuebersetzen(tochter.text, sl.liste) : tochter.text}</p>
              <button type="button" className="zweitrangig" onClick={() => navigator.clipboard.writeText(namen ? zurueckuebersetzen(tochter.text, sl.liste) : tochter.text).catch(() => {})}>Text kopieren{namen ? " (mit Namen)" : " (mit Platzhaltern)"}</button>
            </div>
          )}
          <p className="leise">Gespeichert wird nur die Fassung mit Platzhaltern.</p>
          <p className="leise">Kosten dieser Frage: {(erg.kostenCent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 3 })}</p>
        </section>
      )}
      {haushaltId && <GespeicherteFragen haushaltId={haushaltId} liste={sl.liste} namen={namen} neu={neuGeladen} />}
      <p className="leise">An die KI gehen nur Platzhalter-Fassungen: Einträge, Steckbriefe und einzelne geschwärzte Textseiten, nie das Original. Ohne Gewähr; „nicht gefunden“ heißt unklar. Keine Rechts-, Steuer- oder Abschlussberatung.</p>
    </main>
  );
}

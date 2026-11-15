"use client";
/* Frag die Akte: Frage → auf dem Gerät gegen die Schwärzliste ersetzen → Seiten suchen → KI antwortet mit Quellen.
   Namen werden erst hier in der Anzeige wieder eingesetzt; an die KI und auf den Server gehen nur Platzhalter. */
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { useAkte } from "@/lib/akte/useAkte";
import { fragen, type FrageErgebnis } from "@/lib/geraet/frage";
import { zurueckuebersetzen } from "@/lib/ki/frage";
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

  useEffect(() => {
    if (sl.zustand === "unbekannt") void sl.pruefen();
  }, [sl]);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    if (!akte || !haushaltId || status) return;
    if (frage.trim().length < 3) return setFehler("Bitte eine Frage eingeben.");
    setFehler(""); setErg(null); setKopiert(false);
    try {
      setErg(await fragen(haushaltId, frage, sl.liste, akte, setStatus));
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    }
    setStatus("");
  }

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
            {" "}Gelesen: {gelesen.length ? "" : "nur Einträge und Steckbriefe."}
          </p>
          {gelesen.length > 0 && (
            <ul className="liste">
              {gelesen.map((g) => <li key={g.dokumentId}><Link href={`/dokumente/${g.dokumentId}`}>{g.titel}</Link> <span className="leise">S. {g.seiten.join(", ")}</span></li>)}
            </ul>
          )}
          <label className="janein"><input type="checkbox" checked={namen} onChange={(e) => setNamen(e.target.checked)} /><span>Namen statt Platzhalter anzeigen (nur auf diesem Gerät)</span></label>
          <button type="button" className="zweitrangig" onClick={async () => { try { await navigator.clipboard.writeText(anzeige); setKopiert(true); } catch { setKopiert(false); } }}>{kopiert ? "Kopiert" : "Text kopieren"}</button>
          <p className="leise">Kosten dieser Frage: {(erg.kostenCent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 3 })}</p>
        </section>
      )}
      <p className="leise">An die KI gehen nur Platzhalter-Fassungen: Einträge, Steckbriefe und einzelne geschwärzte Textseiten, nie das Original. Ohne Gewähr; „nicht gefunden“ heißt unklar. Keine Rechts-, Steuer- oder Abschlussberatung.</p>
    </main>
  );
}

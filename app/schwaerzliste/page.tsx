"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { aufraeumen, listePruefen, passwortPruefen, type ListenEintrag } from "@/lib/schwaerzen/liste";
import { dekodiere, listeAusText } from "@/lib/schwaerzen";

const VORSCHLAG: ListenEintrag[] = [{ text: "", ersatz: "[Vater]" }, { text: "", ersatz: "[Mutter]" }, { text: "", ersatz: "[Tochter]" }, { text: "", ersatz: "[Kind 2]" }, { text: "", ersatz: "[Name]" }, { text: "", ersatz: "[Adresse]" }];

export default function Schwaerzliste() {
  const s = useSchwaerzliste();
  useEffect(() => {
    // Zustand der Liste beim Öffnen prüfen (lädt nur den verschlüsselten Block).
    if (s.zustand === "unbekannt") void s.pruefen();
  }, [s]);

  return (
    <main className="seite">
      <Kopf />
      <h1>Schwärzliste</h1>
      <p className="leise">Echte Namen, Anschrift, Telefon und E-Mail der Familie mit Platzhalter. Damit schwärzt die App Dokumente auf dem Gerät, bevor etwas an eine KI geht. Die Liste liegt nur verschlüsselt auf dem Server; das Passwort verlässt nie dieses Gerät.</p>
      {(s.zustand === "unbekannt" || s.zustand === "laden") && <p className="leise">Wird geladen …</p>}
      {s.zustand === "fehler" && <p className="fehler">Die Liste konnte nicht geladen werden.</p>}
      {s.zustand === "keine" && <Anlegen />}
      {s.zustand === "gesperrt" && <Entsperren />}
      {s.zustand === "offen" && <Bearbeiten />}
    </main>
  );
}

function Passwortfelder({ pw, setPw, pw2, setPw2 }: { pw: string; setPw: (x: string) => void; pw2: string; setPw2: (x: string) => void }) {
  return (
    <>
      <label>Gemeinsames Passwort (beide Eltern)<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <label>Passwort wiederholen<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      <p className="leise">Mindestens 12 Zeichen, z. B. vier zufällige Wörter. Ohne Passwort ist die Liste nicht wiederherstellbar: im Passwort-Manager speichern.</p>
    </>
  );
}

function Anlegen() {
  const s = useSchwaerzliste();
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [merken, setMerken] = useState(true), [fehler, setFehler] = useState("");
  async function los(e: FormEvent) {
    e.preventDefault();
    const p = passwortPruefen(pw) ?? (pw !== pw2 ? "Die Passwörter stimmen nicht überein." : null);
    if (p) return setFehler(p);
    setFehler((await s.anlegen(pw, [], merken)) ?? "");
  }
  return (
    <form className="karte" onSubmit={los}>
      <h2>Liste anlegen</h2>
      <Passwortfelder pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
      <label className="janein"><input type="checkbox" checked={merken} onChange={(e) => setMerken(e.target.checked)} /><span>Auf diesem Gerät entsperrt lassen</span></label>
      {fehler && <p className="fehler" role="alert">{fehler}</p>}
      <button type="submit">Anlegen</button>
    </form>
  );
}

function Entsperren() {
  const s = useSchwaerzliste();
  const [pw, setPw] = useState(""), [merken, setMerken] = useState(true), [fehler, setFehler] = useState(""), [laeuft, setLaeuft] = useState(false);
  async function los(e: FormEvent) {
    e.preventDefault(); setLaeuft(true);
    setFehler((await s.entsperren(pw, merken)) ?? "");
    setLaeuft(false);
  }
  return (
    <form className="karte" onSubmit={los}>
      <h2>Entsperren</h2>
      <label>Passwort<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <label className="janein"><input type="checkbox" checked={merken} onChange={(e) => setMerken(e.target.checked)} /><span>Auf diesem Gerät entsperrt lassen</span></label>
      {fehler && <p className="fehler" role="alert">{fehler}</p>}
      <button type="submit" disabled={laeuft}>{laeuft ? "Wird entsperrt …" : "Entsperren"}</button>
    </form>
  );
}

function Bearbeiten() {
  const s = useSchwaerzliste();
  const [zeilen, setZeilen] = useState<ListenEintrag[]>(() => (s.liste.length ? s.liste : VORSCHLAG).concat([{ text: "", ersatz: "[Name]" }]));
  const [meldung, setMeldung] = useState(""), [ok, setOk] = useState(false);
  // nur ausgefüllte Zeilen prüfen, Fehler wieder ihrer Zeile zuordnen
  const gefuellt = zeilen.map((z, i) => ({ z, i })).filter((x) => x.z.text.trim());
  const fehler: Record<number, string> = Object.fromEntries(Object.entries(listePruefen(gefuellt.map((x) => x.z))).map(([k, v]) => [gefuellt[Number(k)].i, v]));
  const setze = (i: number, k: keyof ListenEintrag, v: string) => { setZeilen((l) => l.map((z, j) => (j === i ? { ...z, [k]: v } : z))); setMeldung(""); };

  async function sichern() {
    const l = aufraeumen(zeilen);
    if (Object.keys(listePruefen(l)).length) { setOk(false); return setMeldung("Bitte die markierten Zeilen prüfen."); }
    const f = await s.speichern(l);
    setOk(!f); setMeldung(f ?? `Gespeichert (${l.length} Einträge, verschlüsselt).`);
    if (!f) setZeilen(l.concat([{ text: "", ersatz: "[Name]" }]));
  }
  async function einlesen(datei: File | undefined) {
    if (!datei) return;
    const l = listeAusText(dekodiere(new Uint8Array(await datei.arrayBuffer())));
    if (!l) { setOk(false); return setMeldung("Die Datei enthält keine lesbare Liste."); }
    setZeilen((alt) => aufraeumen(alt).concat(l.filter((x: ListenEintrag) => !alt.some((a) => a.text.trim().toLowerCase() === x.text.toLowerCase()))).concat([{ text: "", ersatz: "[Name]" }]));
    setOk(true); setMeldung(`${l.length} Einträge eingelesen. Bitte prüfen und speichern.`);
  }

  return (
    <>
      <section className="karte">
        <h2>Einträge</h2>
        <p className="leise">Je Zeile ein Text (z. B. voller Name, Nachname allein, Straße mit Hausnummer, Telefon, E-Mail) und sein Platzhalter. Längere Einträge gewinnen.</p>
        {zeilen.map((z, i) => (
          <div key={i} className="listenzeile">
            <input aria-label={`Text ${i + 1}`} placeholder="z. B. Max Mustermann" value={z.text} autoComplete="off" onChange={(e) => setze(i, "text", e.target.value)} aria-invalid={!!(z.text && fehler[i])} />
            <input aria-label={`Platzhalter ${i + 1}`} value={z.ersatz} onChange={(e) => setze(i, "ersatz", e.target.value)} aria-invalid={!!(z.text && fehler[i])} />
            {z.text && fehler[i] && <span className="fehler">{fehler[i]}</span>}
          </div>
        ))}
        <div className="knoepfe">
          <button type="button" className="zweitrangig" onClick={() => setZeilen((l) => l.concat([{ text: "", ersatz: "[Name]" }]))}>+ Zeile</button>
          <button type="button" onClick={sichern}>Speichern</button>
        </div>
        {meldung && <p className={ok ? "leise" : "fehler"} role="status">{meldung}</p>}
      </section>
      <section className="karte">
        <h2>Aus Datei übernehmen</h2>
        <p className="leise">Export aus der bisherigen Haushalts-App oder Textdatei mit „Text;[Platzhalter]“ je Zeile. Die Datei wird nur auf diesem Gerät gelesen.</p>
        <input type="file" accept=".json,.txt,.csv,text/plain,application/json" onChange={(e) => einlesen(e.target.files?.[0])} />
      </section>
      <section className="karte">
        <h2>Sperren</h2>
        <div className="knoepfe">
          <button type="button" className="zweitrangig" onClick={() => s.sperren(false)}>Sperren</button>
          <button type="button" className="zweitrangig" onClick={() => s.sperren(true)}>Sperren und auf diesem Gerät vergessen</button>
        </div>
      </section>
    </>
  );
}

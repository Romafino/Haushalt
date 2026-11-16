"use client";
/* Datensicherung: verschlüsselte Datei mit allen Daten (und Bildern), Prüfen einer Datei, monatliche Erinnerung. */
import { useState } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { erinnerungAnlegen, sicherungErstellen } from "@/lib/geraet/sicherung";
import { oeffnen, PASSWORT_MIN, zusammenfassung } from "@/lib/akte/sicherung";
import * as R from "@/lib/regeln";

export default function Sicherung() {
  const { akte, haushaltId, fehler: ladeFehler, neuLaden } = useAkte();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [bilder, setBilder] = useState(true);
  const [status, setStatus] = useState("");
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [pruefPw, setPruefPw] = useState("");
  const [pruefDatei, setPruefDatei] = useState<File | null>(null);
  const [pruefung, setPruefung] = useState<ReturnType<typeof zusammenfassung> | null>(null);
  const letzte = akte?.einst.letzteSicherung as string | undefined;
  const pwFehler = pw && pw.length < PASSWORT_MIN ? `Mindestens ${PASSWORT_MIN} Zeichen.` : pw2 && pw !== pw2 ? "Die Passwörter stimmen nicht überein." : "";

  async function erstellen() {
    if (!haushaltId || pwFehler || !pw) return;
    setFehler(""); setMeldung("");
    try {
      const r = await sicherungErstellen(haushaltId, pw, bilder, setStatus);
      setMeldung(`Sicherung gespeichert (${r.groesseMb} MB${bilder ? `, ${r.bilder} Bilder` : ""}).${r.fehlend ? ` ${r.fehlend} Bilder fehlten im Speicher.` : ""} Bitte die Datei an einem sicheren Ort ablegen und mit „Sicherung prüfen“ testen.`);
      setPw(""); setPw2(""); await neuLaden();
    } catch (e) { setFehler(e instanceof Error ? e.message : "Die Sicherung hat nicht geklappt."); }
    setStatus("");
  }

  async function pruefen() {
    if (!pruefDatei) return;
    setFehler(""); setPruefung(null); setStatus("Datei wird geöffnet …");
    try { setPruefung(zusammenfassung(await oeffnen(await pruefDatei.text(), pruefPw))); }
    catch (e) { setFehler(e instanceof Error ? e.message : "Die Datei konnte nicht geöffnet werden."); }
    setStatus("");
  }

  return (
    <main className="seite">
      <Kopf zurueck="/" text="Übersicht" />
      <h1>Datensicherung</h1>
      <section className="karte formular">
        <p>Speichert alle Daten des Haushalts als eine verschlüsselte Datei auf diesem Gerät. Der kostenlose Datenbank-Tarif macht selbst keine Sicherungen.</p>
        <p className="leise">Letzte Sicherung: {letzte ? R.fmt(letzte) : "noch keine"}</p>
        <label><span>Passwort für die Datei (mind. {PASSWORT_MIN} Zeichen)</span><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label><span>Passwort wiederholen</span><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        {pwFehler && <p className="fehler">{pwFehler}</p>}
        <label className="janein"><input type="checkbox" checked={bilder} onChange={(e) => setBilder(e.target.checked)} /><span>Dokumentbilder und Schadenfotos einschließen (größere Datei)</span></label>
        <p className="leise">Ohne das Passwort lässt sich die Sicherung nicht öffnen – bitte gut aufbewahren (z. B. im Passwort-Manager). Die Datei enthält auch ungeschwärzte Schadenfotos und die verschlüsselte Schwärzliste.</p>
        <button disabled={!haushaltId || !pw || !pw2 || !!pwFehler || !!status} onClick={erstellen}>{status || "Sicherung erstellen"}</button>
      </section>

      <section className="karte formular">
        <h2>Sicherung prüfen</h2>
        <p className="leise">Öffnet eine Sicherungsdatei auf diesem Gerät und zeigt, was drinsteckt. Es wird nichts verändert.</p>
        <input type="file" accept="application/json,.json" onChange={(e) => { setPruefDatei(e.target.files?.[0] ?? null); setPruefung(null); }} />
        <label><span>Passwort der Datei</span><input type="password" autoComplete="off" value={pruefPw} onChange={(e) => setPruefPw(e.target.value)} /></label>
        <button className="zweitrangig" disabled={!pruefDatei || !pruefPw || !!status} onClick={pruefen}>Prüfen</button>
        {pruefung && (
          <p>In Ordnung – Sicherung vom {new Date(pruefung.erstellt).toLocaleString("de-DE")}: {pruefung.vertraege} Verträge, {pruefung.firmen} Firmen, {pruefung.dinge} Dinge, {pruefung.belege} Belege, {pruefung.dokumente} Dokumente, {pruefung.termine} Termine, {pruefung.schadenfaelle} Schadenfälle, {pruefung.fragen} gespeicherte Fragen, {pruefung.dateien} Bilder{pruefung.schwaerzliste ? ", Schwärzliste" : ""}.</p>
        )}
      </section>

      <section className="karte">
        <h2>Erinnerung</h2>
        <p className="leise">Ein monatlicher Termin „Datensicherung erstellen“ – mit Push und im Kalender-Abo.</p>
        <button className="zweitrangig" disabled={!haushaltId || !!status} onClick={async () => {
          if (!haushaltId) return;
          const f = await erinnerungAnlegen(haushaltId, R.addMonths(R.heute(), 1));
          setMeldung(f ?? "Monatliche Erinnerung angelegt (ab nächstem Monat)."); await neuLaden();
        }}>Monatliche Erinnerung anlegen</button>
      </section>

      {meldung && <p className="leise" role="status">{meldung}</p>}
      {(fehler || ladeFehler) && <p className="fehler" role="alert">{fehler || ladeFehler}</p>}
    </main>
  );
}

"use client";
/* Dokument aufnehmen: Foto/PDF → auf dem Gerät lesen → automatisch schwärzen → prüfen → nur die geschwärzte Fassung speichern. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Kopf } from "@/components/akte/kopf";
import { SeitenEditor } from "@/components/dokument/editor";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { useAkte } from "@/lib/akte/useAkte";
import { dateienLaden, erkennen, type Seite } from "@/lib/geraet/seiten";
import { dokumentSpeichern } from "@/lib/geraet/speichern";
import { autoBalken, seitenText } from "@/lib/schwaerzen/seitentext";
import { leererVerlauf, type Verlauf } from "@/lib/schwaerzen/verlauf";
import { nummernFinden } from "@/lib/schwaerzen/schutz";
import { zeileAus, zeilen } from "@/lib/schwaerzen/such";
import { freitextPruefen } from "@/lib/akte/freitext";
import { kiAuslesen, type KiAntwort } from "@/lib/geraet/ki";
import { seitenInGrenze } from "@/lib/ki/prompt";
import { dublettenSuchen, type Dublette } from "@/lib/geraet/dubletten";
import { startAuswahl, uebernahme, type Auswahl } from "@/lib/ki/uebernahme";
import { VorschlagPruefen } from "@/components/dokument/vorschlag";
import * as R from "@/lib/regeln";

export default function DokumentNeu() {
  const router = useRouter();
  const sl = useSchwaerzliste();
  const { akte, haushaltId } = useAkte();
  const [seiten, setSeiten] = useState<Seite[] | null>(null);
  const [quelle, setQuelle] = useState<"pdf" | "foto">("foto");
  const [aktiv, setAktiv] = useState(0);
  const [verlaeufe, setVerlaeufe] = useState<Record<number, Verlauf>>({});
  const [status, setStatus] = useState("");
  const [fehler, setFehler] = useState("");
  const [kiFehler, setKiFehler] = useState(""); // direkt unter „Mit KI auslesen“, oben wäre sie außer Sicht
  const [kiLaeuft, setKiLaeuft] = useState(false);
  const [meta, setMeta] = useState<Record<string, string>>({ typ: "Brief", titel: "", datum: "", gueltigVon: "", gueltigBis: "", vertragId: "", dingId: "", firmaId: "", ablageort: "" });
  const eingabe = useRef<HTMLInputElement>(null);
  // Dokument-ID erst bei Bedarf erzeugen (nicht beim Vorab-Rendern); bleibt für dieses Dokument gleich
  const dokId = useRef<string | null>(null);
  const dokumentId = () => (dokId.current ??= crypto.randomUUID());
  const [ki, setKi] = useState<KiAntwort | null>(null);
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const [hinweise, setHinweise] = useState<string[]>([]);
  // Tresor: Kundennummern aus dem Original (nur auf dem Gerät), abwählbar; Übernahme nach dem Speichern zum gewählten Vertrag
  const gefunden = useMemo(() => (seiten ? nummernFinden(seiten.flatMap((x) => (x.stuecke ? (zeilen(x.stuecke) as Parameters<typeof zeileAus>[0][]).map((z) => zeileAus(z).text as string) : []))) : []), [seiten]);
  const [abgewaehlt, setAbgewaehlt] = useState<string[]>([]);
  // Dubletten: einmal je Dokument prüfen, vor KI-Aufruf bzw. Speichern; nach Bestätigung nicht erneut
  const [dubletten, setDubletten] = useState<Dublette[] | null>(null);
  const [dublettenOk, setDublettenOk] = useState(false);
  async function dublettenGeprueft(): Promise<boolean> {
    if (dublettenOk || !seiten || !haushaltId) return true;
    setStatus("Wird mit vorhandenen Dokumenten verglichen …");
    const d = await dublettenSuchen(haushaltId, seiten, sl.liste);
    setStatus("");
    if (!d.length) { setDublettenOk(true); return true; }
    setDubletten(d);
    return false;
  }

  useEffect(() => {
    // Zustand der Schwärzliste prüfen (lädt nur den verschlüsselten Block).
    if (sl.zustand === "unbekannt") void sl.pruefen();
  }, [sl]);

  // Wie viele Seiten liest die KI (Textgrenze)? Vorab anzeigen, damit es keine Überraschung gibt.
  const kiSeiten = useMemo(() => (seiten ? seitenInGrenze(seiten.map((x, i) => ({ nr: i + 1, text: seitenText(x.stuecke, x.balken, sl.liste) }))) : 0), [seiten, sl.liste]);
  const labels = useMemo(() => Array.from(new Set([...sl.liste.map((e) => e.ersatz), "[Name]", "[Adresse]", "[Telefon]", "[E-Mail]", "[Nummer]", "[Datum]", "[geschwärzt]"])), [sl.liste]);

  async function laden(files: FileList | File[] | null) {
    if (!files?.length) return;
    setFehler(""); setKiFehler(""); setSeiten(null); setAktiv(0); setVerlaeufe({}); setKi(null); setAuswahl(null); setDubletten(null); setDublettenOk(false);
    try {
      const r = await dateienLaden(Array.from(files), setStatus);
      try { await erkennen(r.seiten, setStatus); }
      catch { setFehler("Die Texterkennung lief hier nicht. Bitte die Seiten von Hand schwärzen; der Text bleibt dann leer."); }
      setQuelle(r.quelle);
      setSeiten(r.seiten.map((x) => ({ ...x, balken: x.stuecke ? autoBalken(x.stuecke, sl.liste) : [] })));
    } catch (e) {
      setFehler("Die Datei konnte nicht geöffnet werden: " + (e instanceof Error ? e.message : String(e)));
    }
    setStatus("");
  }

  /** Erfundene Beispiel-Police zum Ausprobieren (keine echten Daten). */
  async function beispiel() {
    setStatus("Beispiel wird geladen …");
    const r = await fetch("/beispiel/beispiel-police.pdf");
    if (!r.ok) { setStatus(""); return setFehler("Das Beispiel konnte nicht geladen werden."); }
    await laden([new File([await r.blob()], "beispiel-police.pdf", { type: "application/pdf" })]);
  }

  async function auslesen() {
    if (!seiten || !haushaltId || !akte) return;
    setFehler(""); setKiFehler("");
    if (!(await dublettenGeprueft())) return;
    setStatus("Die KI liest die geschwärzten Seiten …"); setKiLaeuft(true);
    try {
      const k = await kiAuslesen(haushaltId, seiten, sl.liste, akte);
      setKi(k);
      const a = startAuswahl(k.vorschlag);
      setAuswahl(a);
      const d = k.vorschlag.dokument ?? {};
      setMeta((m) => ({ ...m, typ: String(d.typ ?? m.typ), titel: String(d.titel ?? m.titel), datum: String(d.datum ?? ""), gueltigVon: String(d.gueltigVon ?? ""), gueltigBis: String(d.gueltigBis ?? "") }));
    } catch (e) {
      setKiFehler(e instanceof Error ? e.message : "Die KI ist gerade nicht erreichbar.");
    }
    setStatus(""); setKiLaeuft(false);
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!seiten || !haushaltId) return;
    const t = freitextPruefen(meta.titel, "streng") ?? freitextPruefen(meta.ablageort, "streng");
    if (t) return setFehler("Titel: " + t);
    setFehler("");
    if (!(await dublettenGeprueft())) return;
    try {
      let m: Record<string, unknown> = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, v || null]));
      let ops: ReturnType<typeof uebernahme>["ops"] = [];
      if (ki && auswahl && akte) {
        const u = uebernahme(ki.vorschlag, { ...auswahl, dokument: m }, akte, { dokumentId: dokumentId(), heute: R.heute(), neueId: () => crypto.randomUUID() });
        m = u.meta; ops = u.ops; setHinweise(u.hinweise);
      }
      const id = await dokumentSpeichern({ haushaltId, meta: m, seiten, quelle, liste: sl.liste, ops, id: dokumentId(), status: setStatus });
      // Nummern in den Tresor beim Vertrag (verschlüsselt, nur auf dem Gerät lesbar)
      const vertragId = typeof m.vertragId === "string" ? m.vertragId : "";
      const neu = gefunden.filter((n) => !abgewaehlt.includes(n.art + n.nummer));
      if (vertragId && neu.length) {
        const alt = sl.nummern[vertragId] ?? [];
        const zusammen = [...alt, ...neu.filter((n) => !alt.some((a) => a.art === n.art && a.nummer === n.nummer))];
        const f = await sl.nummernSpeichern({ ...sl.nummern, [vertragId]: zusammen });
        if (f) setFehler("Dokument gespeichert, aber die Nummern konnten nicht in den Tresor: " + f);
      }
      router.replace(`/dokumente/${id}`);
    } catch (e2) {
      setFehler(e2 instanceof Error ? e2.message : "Speichern hat nicht geklappt.");
    }
    setStatus("");
  }

  if (sl.zustand !== "offen") {
    return (
      <main className="seite">
        <Kopf zurueck="/dokumente" text="Dokumente" />
        <h1>Dokument aufnehmen</h1>
        <section className="karte">
          <p>{sl.zustand === "keine" ? "Bitte zuerst die Schwärzliste anlegen." : sl.zustand === "gesperrt" ? "Bitte zuerst die Schwärzliste entsperren." : "Schwärzliste wird geprüft …"}</p>
          <p className="leise">Ohne Schwärzliste würden Namen und Anschrift nicht automatisch geschwärzt.</p>
          {(sl.zustand === "keine" || sl.zustand === "gesperrt") && <Link className="knopf" href="/schwaerzliste">Zur Schwärzliste</Link>}
        </section>
      </main>
    );
  }

  const s = seiten?.[aktiv];
  const anzahl = seiten?.reduce((n, x) => n + x.balken.length, 0) ?? 0;
  return (
    <main className="seite">
      <Kopf zurueck="/dokumente" text="Dokumente" />
      <h1>Dokument aufnehmen</h1>
      <section className="karte">
        <p className="leise">Fotos oder ein PDF. Alles wird auf diesem Gerät gelesen und geschwärzt; gespeichert wird nur die geschwärzte Fassung.</p>
        <input ref={eingabe} type="file" accept="application/pdf,image/*" multiple onChange={(e) => laden(e.target.files)} />
        <button type="button" className="zweitrangig" onClick={beispiel} disabled={!!status}>Beispiel-Dokument laden (erfundene Daten)</button>
        {status && <p className="leise" role="status">{status}</p>}
        {fehler && <p className="fehler" role="alert">{fehler}</p>}
      </section>

      {seiten && s && (
        <>
          <section className="karte">
            <div className="zeile">
              <h2>Seite {aktiv + 1} von {seiten.length}</h2>
              <span className="marke">{anzahl} Balken</span>
            </div>
            {seiten.length > 1 && (
              <div className="knoepfe">
                <button type="button" className="zweitrangig" disabled={aktiv === 0} onClick={() => setAktiv(aktiv - 1)}>← Zurück</button>
                <button type="button" className="zweitrangig" disabled={aktiv === seiten.length - 1} onClick={() => setAktiv(aktiv + 1)}>Weiter →</button>
              </div>
            )}
            <SeitenEditor key={aktiv} seite={s} labels={labels} verlauf={verlaeufe[aktiv] ?? leererVerlauf()}
              aendern={(l, v) => { setSeiten(seiten.map((x, i) => (i === aktiv ? { ...x, balken: l } : x))); setVerlaeufe({ ...verlaeufe, [aktiv]: v }); }}
              automatisch={() => (s.stuecke ? autoBalken(s.stuecke, sl.liste) : [])} />
            <details>
              <summary>Text dieser Seite (so wird er gespeichert)</summary>
              <pre className="seitentext">{seitenText(s.stuecke, s.balken, sl.liste) || "(kein Text erkannt)"}</pre>
            </details>
            <p className="leise">Bitte jede Seite prüfen: Namen, Anschrift, Unterschrift, Nummern. Fehlt ein Balken, „Balken ziehen“.</p>
          </section>

          {dubletten && !dublettenOk && (
            <section className="karte" role="alert">
              <h2>Schon vorhanden?</h2>
              {dubletten.map((d) => (
                <p key={d.dokument_id}>
                  {d.gleich ? "Gleicher Text wie" : `Sieht zu ${Math.round(d.aehnlichkeit * 100)} % aus wie`}{" "}
                  <Link href={`/dokumente/${d.dokument_id}`}>{d.titel || d.typ}</Link>{d.datum ? ` vom ${R.fmt(d.datum)}` : ""}.
                </p>
              ))}
              <p className="leise">Doppelte Dokumente kosten unnötig KI-Geld und können Verträge, Fassungen oder Belege doppelt anlegen.</p>
              <div className="aktionen">
                <button type="button" className="zweitrangig" onClick={() => { setDublettenOk(true); setDubletten(null); }}>Trotzdem weitermachen</button>
                <Link className="knopf" href={`/dokumente/${dubletten[0].dokument_id}`}>Vorhandenes öffnen</Link>
              </div>
            </section>
          )}

          <section className="karte">
            <h2>Mit KI auslesen</h2>
            <p className="leise">Sendet nur die geschwärzten Seiten (Bild und Text) an die KI. Sie schlägt Angaben, Vertrag, Firma, Ereignis und Steckbrief vor; du bestätigst. Kosten je Dokument nur wenige Cent [prüfen], Monatslimit {Number(akte?.einst.kiLimitEuro ?? 10)} €.</p>
            {!ki && seiten && kiSeiten < seiten.length && (
              <p className="fehler">Sehr langes Dokument: Die KI liest nur Seite 1 bis {kiSeiten} von {seiten.length}. Gespeichert und durchsuchbar werden alle Seiten. Für eine vollständige Auswertung den Rest als eigenes Dokument aufnehmen.</p>
            )}
            {!ki && <button type="button" onClick={auslesen} disabled={!!status || !akte}>Mit KI auslesen</button>}
            {kiLaeuft && <p className="leise" role="status">{status}</p>}
            {kiFehler && <p className="fehler" role="alert">{kiFehler}</p>}
            {dubletten && !dublettenOk && <p className="fehler">Bitte zuerst oben „Schon vorhanden?“ prüfen.</p>}
            {ki && (
              <p className={ki.limit?.warnung ? "fehler" : "leise"}>
                Kosten dieses Aufrufs: {(ki.kostenCent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 3 })}.
                {" "}Diesen Monat: {((ki.limit?.verbrauchtCent ?? 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} von {((ki.limit?.limitCent ?? 1000) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}.
              </p>
            )}
            {ki?.warnung && <p className="fehler" role="alert">{ki.warnung}</p>}
          </section>

          {ki && auswahl && akte && <VorschlagPruefen v={ki.vorschlag} a={auswahl} setA={setAuswahl} S={akte} />}

          <form className="karte formular" onSubmit={speichern}>
            <h2>Angaben</h2>
            <label>Art<select value={meta.typ} onChange={(e) => setMeta({ ...meta, typ: e.target.value })}>{R.ENUM.typ.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Titel<input value={meta.titel} maxLength={200} onChange={(e) => setMeta({ ...meta, titel: e.target.value })} placeholder="z. B. Hausrat Police 2026" /></label>
            <label>Ablageort des Originals<input value={meta.ablageort} maxLength={200} onChange={(e) => setMeta({ ...meta, ablageort: e.target.value })} placeholder="z. B. Ordner Versicherungen, Fach 3" /></label>
            <label>Datum des Dokuments<input type="date" value={meta.datum} onChange={(e) => setMeta({ ...meta, datum: e.target.value })} /></label>
            <label>Gültig von<input type="date" value={meta.gueltigVon} onChange={(e) => setMeta({ ...meta, gueltigVon: e.target.value })} /></label>
            <label>Gültig bis<input type="date" value={meta.gueltigBis} onChange={(e) => setMeta({ ...meta, gueltigBis: e.target.value })} /></label>
            {akte && !auswahl && (
              <>
                <label>Vertrag<select value={meta.vertragId} onChange={(e) => setMeta({ ...meta, vertragId: e.target.value })}><option value="">–</option>{akte.vertraege.map((v) => <option key={v.id} value={v.id}>{String(v.kurzname)}</option>)}</select></label>
                <label>Ding<select value={meta.dingId} onChange={(e) => setMeta({ ...meta, dingId: e.target.value })}><option value="">–</option>{akte.dinge.map((d) => <option key={d.id} value={d.id}>{String(d.name)}</option>)}</select></label>
                <label>Firma<select value={meta.firmaId} onChange={(e) => setMeta({ ...meta, firmaId: e.target.value })}><option value="">–</option>{akte.firmen.map((f) => <option key={f.id} value={f.id}>{String(f.name)}</option>)}</select></label>
              </>
            )}
            {gefunden.length > 0 && (
              <fieldset>
                <legend>Nummern für den Tresor</legend>
                <p className="leise">Im Dokument erkannt. Werden verschlüsselt beim Vertrag gespeichert, nur auf euren Geräten sichtbar, nie an die KI. Im Dokument stehen sie als Platzhalter.</p>
                {gefunden.map((n) => {
                  const k = n.art + n.nummer;
                  return (
                    <label key={k} className="janein">
                      <input type="checkbox" checked={!abgewaehlt.includes(k)} onChange={(e) => setAbgewaehlt(e.target.checked ? abgewaehlt.filter((x) => x !== k) : [...abgewaehlt, k])} />
                      <span>{n.art}: <strong>{n.nummer}</strong></span>
                    </label>
                  );
                })}
                {!(meta.vertragId || (auswahl?.vertrag && auswahl.vertrag !== "")) && <p className="fehler">Übernahme nur mit Vertrag – bitte oben einen Vertrag wählen (oder per KI-Vorschlag zuordnen).</p>}
              </fieldset>
            )}
            {hinweise.length > 0 && <ul className="leise">{hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>}
            <button type="submit" disabled={!!status}>Geschwärzt speichern</button>
          </form>
        </>
      )}
    </main>
  );
}

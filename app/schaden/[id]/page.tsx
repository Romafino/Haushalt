"use client";
/* Ein Schadenfall: Prüfung je Police, Status, Verlauf, Fotos (nie an die KI), Pflichten/Fristen als Termine. */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { fotoHochladen } from "@/lib/geraet/schaden";
import { PruefungKarte } from "@/components/schaden/pruefung";
import { STATUS_SCHADEN } from "@/components/schaden/status";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { zurueckuebersetzen } from "@/lib/ki/frage";
import { anonymisieren } from "@/lib/schwaerzen";
import { textSauber } from "@/lib/ki/antwort";
import * as R from "@/lib/regeln";

type Fall = { id: string; datum: string; titel: string; beschreibung: string; status: string };
type Zeile = Record<string, unknown>;

function SchadenFall() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sl = useSchwaerzliste();
  const { akte, haushaltId, fehler: ladeFehler } = useAkte();
  const [fall, setFall] = useState<Fall | null>(null);
  const [pruef, setPruef] = useState<Zeile[]>([]);
  const [dinge, setDinge] = useState<string[]>([]);
  const [verlauf, setVerlauf] = useState<Zeile[]>([]);
  const [termine, setTermine] = useState<Zeile[]>([]);
  const [fotos, setFotos] = useState<{ id: string; pfad: string; url?: string }[]>([]);
  const [meldung, setMeldung] = useState("");
  const [notiz, setNotiz] = useState("");
  const [terminText, setTerminText] = useState<{ text: string; vertragId: string } | null>(null);
  const [terminDatum, setTerminDatum] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    const sb = supabaseBrowser();
    const [f, p, d, v, t, b] = await Promise.all([
      sb.from("schadenfaelle").select("id, datum, titel, beschreibung, status").eq("id", id).maybeSingle(),
      sb.from("schaden_pruefungen").select("*").eq("schaden_id", id),
      sb.from("schaden_dinge").select("ding_id").eq("schaden_id", id),
      sb.from("ereignisse").select("id, datum, text, erstellt_am").eq("schaden_id", id).is("verworfen_am", null).order("erstellt_am"),
      sb.from("termine").select("id, titel, datum, status").eq("schaden_id", id).is("verworfen_am", null).order("datum"),
      sb.from("schaden_fotos").select("id, pfad").eq("schaden_id", id).order("erstellt_am"),
    ]);
    if (!f.data) return setMeldung("Schadenfall nicht gefunden.");
    setFall(f.data as Fall); setPruef(p.data ?? []); setDinge((d.data ?? []).map((x) => String(x.ding_id)));
    setVerlauf(v.data ?? []); setTermine(t.data ?? []);
    const pfade = (b.data ?? []).map((x) => String(x.pfad));
    const urls = pfade.length ? (await sb.storage.from("schadenfotos").createSignedUrls(pfade, 600)).data ?? [] : [];
    setFotos((b.data ?? []).map((x, i) => ({ id: String(x.id), pfad: String(x.pfad), url: urls[i]?.signedUrl ?? undefined })));
  }, [id]);
  useEffect(() => { if (sl.zustand === "unbekannt") void sl.pruefen(); }, [sl]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void laden(); }, [laden]);

  const zeig = (t: string) => (sl.zustand === "offen" ? zurueckuebersetzen(t, sl.liste) : t);
  const vertrag = (vid: unknown) => akte?.vertraege.find((x) => x.id === vid);
  const firma = (vid: unknown) => akte?.firmen.find((x) => x.id === vertrag(vid)?.firmaId);

  async function mit(f: () => PromiseLike<{ error: unknown }>, ok = "") {
    setLaeuft(true); setMeldung("");
    const { error } = await f();
    setMeldung(error ? "Das hat nicht geklappt." : ok);
    await laden(); setLaeuft(false);
    return !error;
  }

  if (!fall) return <main className="seite"><Kopf zurueck="/schaden" text="Schadenfall" /><p className="leise">{meldung || ladeFehler || "Wird geladen …"}</p></main>;
  return (
    <main className="seite">
      <Kopf zurueck="/schaden" text="Schadenfall" />
      <h1>{zeig(fall.titel)}</h1>
      <section className="karte">
        <p className="leise">Schadentag {R.fmt(fall.datum)} · Status: {STATUS_SCHADEN[fall.status] ?? fall.status}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{zeig(fall.beschreibung)}</p>
        {dinge.length > 0 && <p className="leise">Betroffen: {dinge.map((d) => String(akte?.dinge.find((x) => x.id === d)?.name ?? "…")).join(", ")}</p>}
        <label>
          <span>Status ändern</span>
          <select value={fall.status} disabled={laeuft || !haushaltId} onChange={(e) => haushaltId && mit(() => supabaseBrowser().rpc("schaden_status", { p_haushalt_id: haushaltId, p_id: id, p_status: e.target.value }), "Status geändert.")}>
            {Object.entries(STATUS_SCHADEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </section>

      <h2>Prüfung je Police</h2>
      {!pruef.length && <p className="leise">Am Schadentag war keine Versicherung in Kraft oder es wurde nichts geprüft.</p>}
      {pruef.map((p) => (
        <PruefungKarte key={String(p.id)} termin={(text) => { setTerminText({ text, vertragId: String(p.vertrag_id) }); setTerminDatum(R.addDays(R.heute(), 3)); }} p={{
          kurzname: String(vertrag(p.vertrag_id)?.kurzname ?? "Police"), firma: firma(p.vertrag_id)?.name as string | undefined, hotline: (firma(p.vertrag_id)?.hotline ?? firma(p.vertrag_id)?.telefon) as string | undefined,
          greift: String(p.greift), andereSparte: !!p.andere_sparte, begruendung: zeig(String(p.begruendung ?? "")), fundstellen: (p.fundstellen as []) ?? [], ausschluesse: (p.ausschluesse as string[]) ?? [],
          selbstbeteiligung: (p.selbstbeteiligung as string) ?? null, pflichten: (p.pflichten as string[]) ?? [], fristen: (p.fristen as string[]) ?? [], offeneFragen: (p.offene_fragen as string[]) ?? [], steckbriefVon: p.steckbrief_von as string | null,
        }} />
      ))}
      {terminText && (
        <section className="karte formular">
          <h3>Termin anlegen</h3>
          <p>{terminText.text}</p>
          <label><span>Datum</span><input type="date" value={terminDatum} onChange={(e) => setTerminDatum(e.target.value)} /></label>
          <div className="aktionen">
            <button disabled={laeuft || !terminDatum} onClick={async () => {
              if (!haushaltId) return;
              const ok = await mit(() => supabaseBrowser().from("termine").insert({ haushalt_id: haushaltId, titel: (fall.titel + ": " + terminText.text).slice(0, 200), datum: terminDatum, schaden_id: id, vertrag_id: terminText.vertragId, quelle: "schaden" }), "Termin angelegt – mit Erinnerung und im Kalender.");
              if (ok) setTerminText(null);
            }}>Anlegen</button>
            <button className="zweitrangig" onClick={() => setTerminText(null)}>Abbrechen</button>
          </div>
        </section>
      )}
      <p className="leise">Ohne Gewähr; „unklar“ heißt nicht „nicht versichert“. Keine Rechtsberatung. Nach einem Schadenfall kann es ein Sonderkündigungsrecht geben – ob und mit welcher Frist, steht in den Bedingungen [prüfen].</p>

      {termine.length > 0 && (
        <section className="karte">
          <h2>Termine</h2>
          <ul className="liste">{termine.map((t) => <li key={String(t.id)} className="eintrag"><strong>{zeig(String(t.titel))}</strong><span className="leise">{R.fmt(String(t.datum))} · {String(t.status)}</span></li>)}</ul>
        </section>
      )}

      <section className="karte">
        <h2>Fotos</h2>
        <p className="leise">Schadenfotos werden ungeschwärzt und privat gespeichert und gehen nie an eine KI.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "0.5rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {fotos.map((f) => f.url ? <a key={f.id} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt="Schadenfoto" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} /></a> : null)}
        </div>
        <label className="knopf zweitrangig" style={{ cursor: "pointer" }}>
          Foto hinzufügen
          <input type="file" accept="image/*" multiple hidden disabled={laeuft} onChange={async (e) => {
            const dateien = Array.from(e.target.files ?? []); e.target.value = "";
            if (!haushaltId || !dateien.length) return;
            setLaeuft(true); setMeldung(`${dateien.length} Foto(s) werden hochgeladen …`);
            const fehler = (await Promise.all(dateien.map((d) => fotoHochladen(haushaltId, id, d)))).filter(Boolean);
            setMeldung(fehler.length ? String(fehler[0]) : "Fotos gespeichert.");
            await laden(); setLaeuft(false);
          }} />
        </label>
      </section>

      <section className="karte">
        <h2>Verlauf</h2>
        <ul className="liste">{verlauf.map((v) => <li key={String(v.id)} className="eintrag"><span>{zeig(String(v.text))}</span><span className="leise">{R.fmt(String(v.datum))}</span></li>)}</ul>
        <label><span>Notiz zum Verlauf (z. B. Meldung, Antwort des Versicherers, Rechnung)</span><textarea rows={2} value={notiz} maxLength={1000} onChange={(e) => setNotiz(e.target.value)} /></label>
        {sl.zustand !== "offen" && <p className="leise">Zum Speichern von Notizen bitte die Schwärzliste entsperren (Namen werden vorher ersetzt).</p>}
        <button disabled={laeuft || notiz.trim().length < 2 || !haushaltId || sl.zustand !== "offen"} onClick={async () => {
          if (!haushaltId) return;
          // Freitext wird wie überall gegen die Schwärzliste ersetzt, Nummern/IBAN entfernt
          const text = textSauber(anonymisieren(notiz.trim(), sl.liste).text);
          if (await mit(() => supabaseBrowser().from("ereignisse").insert({ haushalt_id: haushaltId, datum: R.heute(), typ: "schaden", text, schaden_id: id }), "Notiz gespeichert.")) setNotiz("");
        }}>Notiz speichern</button>
      </section>

      {meldung && <p className="leise" role="status">{meldung}</p>}
      <button className="zweitrangig" disabled={laeuft || !haushaltId} onClick={async () => {
        if (!haushaltId || !confirm("Schadenfall verwerfen? Er verschwindet aus der Liste, wird aber nicht gelöscht.")) return;
        if (await mit(() => supabaseBrowser().from("schadenfaelle").update({ verworfen_am: new Date().toISOString() }).eq("id", id).eq("haushalt_id", haushaltId))) router.push("/schaden");
      }}>Verwerfen</button>
    </main>
  );
}

export default function Seite() {
  return <Suspense fallback={<main className="seite"><p className="leise">Wird geladen …</p></main>}><SchadenFall /></Suspense>;
}

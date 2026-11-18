"use client";
import { Suspense, useState } from "react";
import { RegelStand } from "@/components/regel-stand";
import { TresorNummern } from "@/components/tresor-nummern";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { useAkte, speichern, vertragSpeichern, verwerfen, endgueltigLoeschen, opsAnwenden } from "@/lib/akte/useAkte";
import { zuZeile, type Akte, type Eintrag } from "@/lib/akte/abbilden";
import { opsUebersetzen } from "@/lib/akte/ops";
import { EreignisEintragen, Kuendigungsentwurf } from "@/components/akte/ereignis";
import * as R from "@/lib/regeln";
import { BEREICHE, NEU } from "@/components/akte/definitionen";
import { Formular, type Bezuege } from "@/components/akte/formular";
import { Kopf } from "@/components/akte/kopf";
import { TerminVorlagen } from "@/components/akte/terminvorlagen";
import { dingAkte } from "@/lib/akte/dingakte";

const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const KASKADE: Record<string, string> = {
  vertraege: "Fassungen, Bezüge und die Zeitleiste dieses Vertrags werden mitgelöscht. Belege und Termine bleiben, verlieren aber die Zuordnung.",
  firmen: "Verträge und Belege bleiben, verlieren aber die Firma.",
  dinge: "Die Zeitleiste des Dings wird mitgelöscht. Verträge, Belege und Termine bleiben, verlieren aber den Bezug.",
  belege: "Termine zu diesem Beleg bleiben, verlieren aber die Zuordnung.",
  termine: "",
};

function Detail() {
  const { bereich, id } = useParams<{ bereich: string; id: string }>();
  const router = useRouter();
  const def = BEREICHE[bereich];
  const { akte, haushaltId, fehler, neuLaden } = useAkte();
  const [aktion, setAktion] = useState("");
  const neu = id === "neu";
  const such = useSearchParams();

  if (!def) return <main className="seite"><Kopf /><p className="fehler">Diesen Bereich gibt es nicht.</p></main>;
  const liste = akte ? (bereich === "termine" ? akte.fristen.filter((f) => !f.abgeleitet) : (akte[def.tabelle as keyof Akte] as Eintrag[])) : [];
  const eintrag = neu ? null : liste.find((x) => (bereich === "termine" ? x.dbId : x.id) === id) ?? null;
  const dbId = eintrag ? String(bereich === "termine" ? eintrag.dbId : eintrag.id) : null;

  async function sichern(werte: Record<string, unknown>, bez?: Bezuege): Promise<string | null | { hinweis: string }> {
    if (!haushaltId) return "Kein Haushalt geladen.";
    try {
      // Ding ersetzt/verkauft: Status und Folgen (Prüftermine für verknüpfte Verträge) in einer Transaktion
      const altStatus = String(eintrag?.status ?? "aktiv");
      if (def.tabelle === "dinge" && eintrag && dbId && akte && altStatus === "aktiv" && (werte.status === "ersetzt" || werte.status === "verkauft")) {
        const f = R.dingFolgen({ ...eintrag, ...werte, id: dbId }, altStatus, akte, R.heute());
        await opsAnwenden(haushaltId, [{ art: "aendern", tabelle: "dinge", id: dbId, daten: zuZeile("dinge", werte) }, ...opsUebersetzen(f.ops, akte)]);
        await neuLaden();
        return f.hinweise.length ? { hinweis: f.hinweise.join(" ") } : null;
      }
      const neueId = def.tabelle === "vertraege"
        ? await vertragSpeichern(haushaltId, dbId, werte, bez?.dinge ?? [], bez?.rollen ?? [])
        : await speichern(def.tabelle, haushaltId, dbId, werte);
      await neuLaden();
      if (neu) router.replace(`/akte/${bereich}/${neueId}`);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Speichern hat nicht geklappt.";
    }
  }

  async function wegtun(endgueltig: boolean) {
    if (!haushaltId || !dbId) return;
    const name = String(eintrag?.[def.titelFeld] ?? def.einzahl);
    const frage = endgueltig
      ? `„${name}“ endgültig löschen? Das lässt sich nicht rückgängig machen. ${KASKADE[bereich]}`
      : `„${name}“ verwerfen? Der Eintrag zählt dann nirgends mehr mit.`;
    if (!window.confirm(frage)) return;
    try {
      if (endgueltig) await endgueltigLoeschen(def.tabelle, haushaltId, dbId);
      else await verwerfen(def.tabelle, haushaltId, dbId);
      router.replace(`/akte/${bereich}`);
    } catch (e) {
      setAktion(e instanceof Error ? e.message : "Hat nicht geklappt.");
    }
  }

  return (
    <main className="seite">
      <Kopf zurueck={`/akte/${bereich}`} text={def.titel} />
      <h1>{neu ? `${def.einzahl} anlegen` : String(eintrag?.[def.titelFeld] ?? def.einzahl)}</h1>
      {fehler && <p className="fehler" role="alert">{fehler}</p>}
      {!akte && !fehler && <p className="leise">Wird geladen …</p>}
      {akte && !neu && !eintrag && <p className="fehler">Eintrag nicht gefunden (vielleicht verworfen).</p>}

      {akte && eintrag && def.tabelle === "vertraege" && <VertragInfo v={eintrag} S={akte} />}
      {akte && eintrag && haushaltId && def.tabelle === "vertraege" && <EreignisEintragen key={String(eintrag.status) + String(eintrag.beitrag)} v={eintrag} S={akte} haushaltId={haushaltId} onGeaendert={neuLaden} />}
      {akte && eintrag && def.tabelle === "vertraege" && <TresorNummern bezugId={eintrag.id} vorschlag={R.istVers(eintrag) ? "Versicherungsnummer" : "Kundennummer"} />}
      {akte && eintrag && def.tabelle === "vertraege" && <Kuendigungsentwurf v={eintrag} S={akte} />}
      {akte && eintrag && def.tabelle === "vertraege" && <RegelStand k={R.istVers(eintrag) ? "kuendigung" : "verbraucherLaufzeit"} />}
      {akte && eintrag && def.tabelle === "belege" && !!eintrag.gewArt && String(eintrag.gewArt) !== "keine" && <RegelStand k="gewaehrleistung" />}
      {akte && eintrag && def.tabelle === "firmen" && <Bezogen e={eintrag} feld="firmaId" S={akte} />}
      {akte && eintrag && def.tabelle === "dinge" && <DingUebersicht d={eintrag} S={akte} />}
      {akte && eintrag && haushaltId && def.tabelle === "dinge" && <TerminVorlagen akte={akte} haushaltId={haushaltId} onAngelegt={neuLaden} festDingId={eintrag.id} />}

      {akte && (neu || eintrag) && (
        <Formular
          key={dbId ?? "neu"}
          bereich={def}
          akte={akte}
          eigeneId={dbId ?? undefined}
          haushaltId={haushaltId ?? undefined}
          start={eintrag ?? { ...NEU[bereich], ...vorbelegung(bereich, such, akte) }}
          mitBezuegen={def.tabelle === "vertraege" ? { dinge: R.dingeVon(eintrag ?? vorbelegung(bereich, such, akte)), rollen: R.rollenVon(eintrag ?? {}) } : undefined}
          onSpeichern={sichern}
        />
      )}

      {akte && eintrag && (
        <section className="karte">
          <h2>Entfernen</h2>
          <p className="leise">Verwerfen ist der Normalfall: Der Eintrag verschwindet aus allen Listen und Summen, bleibt aber gespeichert.</p>
          <div className="knoepfe">
            <button className="zweitrangig" onClick={() => wegtun(false)}>Verwerfen</button>
            <button className="gefahr" onClick={() => wegtun(true)}>Endgültig löschen …</button>
          </div>
          {aktion && <p className="fehler">{aktion}</p>}
        </section>
      )}
    </main>
  );
}

function VertragInfo({ v, S }: { v: Eintrag; S: Akte }) {
  const heute: string = R.heute();
  const kj = R.kuendigungJetzt(v, heute);
  const zeitleiste = S.ereignisse.filter((e) => e.vertragId === v.id).sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  const fassungen = S.fassungen.filter((f) => f.vertragId === v.id).sort((a, b) => String(b.gueltigVon).localeCompare(String(a.gueltigVon)));
  return (
    <section className="karte">
      <h2>Kündigung heute</h2>
      <p>{kj ? kj.text : v.status === "aktiv" ? "Für eine Berechnung fehlen Laufzeitende und Kündigungsfrist oder die Verlängerungsregel." : "Der Vertrag ist nicht aktiv."}</p>
      {kj?.hinweis && <p className="leise">{kj.hinweis}</p>}
      <p className="leise">Im Zweifel gilt die Frist im Vertrag. Es zählt der Zugang beim Anbieter. Keine Rechtsberatung.</p>
      {v.beitrag != null && <div className="zeile"><span>pro Monat</span><strong>{euro(R.proMonat(v))}</strong></div>}
      {fassungen.length > 0 && (
        <details><summary>Fassungen ({fassungen.length})</summary>
          <ul className="liste">{fassungen.map((f) => <li key={f.id} className="eintrag"><span>{R.fmt(f.gueltigVon)} – {f.gueltigBis ? R.fmt(f.gueltigBis) : "heute"}</span><span className="leise">{[f.grund, f.beitrag != null ? euro(Number(f.beitrag)) + " " + (f.zahlweise ?? "") : ""].filter(Boolean).join(" · ")}</span></li>)}</ul>
        </details>
      )}
      {zeitleiste.length > 0 && (
        <details><summary>Zeitleiste ({zeitleiste.length})</summary>
          <ul className="liste">{zeitleiste.map((e) => <li key={e.id} className="eintrag"><span>{R.fmt(e.datum)}</span><span className="leise">{String(e.text)}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}

function Bezogen({ e, feld, S }: { e: Eintrag; feld: "dingId" | "firmaId"; S: Akte }) {
  const vertraege = S.vertraege.filter((v) => (feld === "dingId" ? R.dingeVon(v).includes(e.id) : v.firmaId === e.id));
  const belege = S.belege.filter((b) => b[feld] === e.id);
  if (!vertraege.length && !belege.length) return null;
  return (
    <section className="karte">
      <h2>Dazu gehört</h2>
      <ul className="liste">
        {vertraege.map((v) => <li key={v.id} className="eintrag"><Link className="verweis" href={`/akte/vertraege/${v.id}`}><strong>{String(v.kurzname)}</strong><span className="leise">Vertrag · {String(v.status)}</span></Link></li>)}
        {belege.map((b) => <li key={b.id} className="eintrag"><Link className="verweis" href={`/akte/belege/${b.id}`}><strong>{String(b.titel)}</strong><span className="leise">Beleg{b.datum ? " · " + R.fmt(b.datum) : ""}</span></Link></li>)}
      </ul>
    </section>
  );
}

/** Bei „neu“: Ding (oder Vertrag) aus dem Link vorauswählen – nur vorhandene IDs, nur Felder, die es im Bereich gibt. */
function vorbelegung(bereich: string, such: URLSearchParams, S: Akte): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ding = such.get("dingId"), vertrag = such.get("vertragId");
  const felder = BEREICHE[bereich]?.felder.map((f) => f.name) ?? [];
  if (ding && S.dinge.some((d) => d.id === ding)) {
    if (felder.includes("dingId")) out.dingId = ding;
    if (bereich === "vertraege") out.dingId = ding;
  }
  if (vertrag && felder.includes("vertragId") && S.vertraege.some((v) => v.id === vertrag)) out.vertragId = vertrag;
  return out;
}

/** Mini-Akte eines Dings: Verträge, Dokumente, Belege, Termine, Kosten – mit Schnellknöpfen, die das Ding vorauswählen. */
function DingUebersicht({ d, S }: { d: Eintrag; S: Akte }) {
  const a = dingAkte(S, d.id, R.heute());
  const q = `?dingId=${encodeURIComponent(d.id)}`;
  const leer = <p className="leise">Noch nichts.</p>;
  return (
    <>
      <section className="karte">
        <h2>Auf einen Blick</h2>
        <p>Laufende Verträge: <strong>{euro(a.kosten.vertraegeJahr)}</strong> pro Jahr · Belege der letzten 12 Monate: <strong>{euro(a.kosten.belege12Monate)}</strong></p>
        {a.vertraege.some((v) => R.dingeVon(v).length > 1 && R.laeuft(v)) && <p className="leise">Verträge, die mehrere Dinge betreffen, zählen hier voll.</p>}
        <div className="knoepfe">
          <Link className="knopf klein" href={`/akte/vertraege/neu${q}`}>＋ Vertrag</Link>
          <Link className="knopf klein" href={`/dokumente/neu${q}`}>＋ Dokument</Link>
          <Link className="knopf klein" href={`/akte/belege/neu${q}`}>＋ Beleg</Link>
          <Link className="knopf klein" href={`/akte/termine/neu${q}`}>＋ Termin</Link>
        </div>
      </section>
      <section className="karte">
        <h2>Nächste Termine</h2>
        {a.termine.length ? (
          <ul className="liste">
            {a.termine.slice(0, 8).map((t) => (
              <li key={t.id} className="eintrag"><Link className="verweis" href="/akte/termine"><strong>{t.titel}</strong>
                <span className={t.ueberfaellig ? "fehler" : "leise"}>{t.datum ? R.fmt(t.datum) : "ohne Datum"}{t.ueberfaellig ? " · überfällig" : ""}</span></Link></li>
            ))}
          </ul>
        ) : leer}
      </section>
      <section className="karte">
        <h2>Verträge</h2>
        {a.vertraege.length ? (
          <ul className="liste">
            {a.vertraege.map((v) => <li key={v.id} className="eintrag"><Link className="verweis" href={`/akte/vertraege/${v.id}`}><strong>{String(v.kurzname)}</strong>
              <span className="leise">{[v.art, String(v.status), v.beitrag ? euro(Number(v.beitrag)) + " " + String(v.zahlweise ?? "") : ""].filter(Boolean).join(" · ")}</span></Link></li>)}
          </ul>
        ) : leer}
      </section>
      <section className="karte">
        <h2>Dokumente</h2>
        {a.dokumente.length ? (
          <ul className="liste">
            {a.dokumente.map((x) => <li key={x.id} className="eintrag"><Link className="verweis" href={`/dokumente/${x.id}`}><strong>{String(x.titel || x.typ)}</strong>
              <span className="leise">{[x.typ, x.datum ? R.fmt(x.datum) : ""].filter(Boolean).join(" · ")}</span></Link></li>)}
          </ul>
        ) : leer}
      </section>
      <section className="karte">
        <h2>Belege</h2>
        {a.belege.length ? (
          <ul className="liste">
            {a.belege.map((b) => <li key={b.id} className="eintrag"><Link className="verweis" href={`/akte/belege/${b.id}`}><strong>{String(b.titel)}</strong>
              <span className="leise">{[b.datum ? R.fmt(b.datum) : "", b.betrag != null ? euro(Number(b.betrag)) : ""].filter(Boolean).join(" · ")}</span></Link></li>)}
          </ul>
        ) : leer}
      </section>
    </>
  );
}

/* URL-Parameter gibt es erst zur Laufzeit: Inhalt hinter einer Lade-Grenze (Next.js 16, Cache Components). */
export default function Seite() {
  return (
    <Suspense fallback={<main className="seite"><p className="leise">Wird geladen …</p></main>}>
      <Detail />
    </Suspense>
  );
}

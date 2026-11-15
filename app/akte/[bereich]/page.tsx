"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAkte } from "@/lib/akte/useAkte";
import type { Akte, Eintrag } from "@/lib/akte/abbilden";
import * as R from "@/lib/regeln";
import { BEREICHE, STATUS_VERTRAG } from "@/components/akte/definitionen";
import { Kopf } from "@/components/akte/kopf";

const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

function Liste() {
  const { bereich } = useParams<{ bereich: string }>();
  const def = BEREICHE[bereich];
  const { akte, fehler } = useAkte();

  if (!def) return <main className="seite"><Kopf /><p className="fehler">Diesen Bereich gibt es nicht.</p></main>;
  return (
    <main className="seite">
      <Kopf />
      <div className="zeile">
        <h1>{def.titel}</h1>
        <Link className="knopf" href={`/akte/${bereich}/neu`}>+ Neu</Link>
      </div>
      {fehler && <p className="fehler" role="alert">{fehler}</p>}
      {!akte && !fehler && <p className="leise">Wird geladen …</p>}
      {akte && <Inhalt bereich={bereich} akte={akte} />}
    </main>
  );
}

function Gruppe({ titel, eintraege }: { titel: string; eintraege: { href: string; titel: string; zusatz?: string; rechts?: string; leise?: boolean }[] }) {
  if (!eintraege.length) return null;
  return (
    <section className="karte">
      <h2>{titel}</h2>
      <ul className="liste">
        {eintraege.map((e) => (
          <li key={e.href} className="eintrag">
            <Link href={e.href} className={e.leise ? "verweis leise" : "verweis"}>
              <span className="zeile"><strong>{e.titel}</strong>{e.rechts && <span className="marke">{e.rechts}</span>}</span>
              {e.zusatz && <span className="leise">{e.zusatz}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Inhalt({ bereich, akte: S }: { bereich: string; akte: Akte }) {
  const heute: string = R.heute();
  const name = (l: Eintrag[], id: unknown) => String(l.find((x) => x.id === id)?.name ?? "");
  const leer = <p className="leise">Noch keine Einträge. Mit „+ Neu“ anlegen.</p>;

  if (bereich === "vertraege") {
    const zeile = (v: Eintrag) => {
      const kj = R.kuendigungJetzt(v, heute);
      const k = !kj ? "" : kj.art === "termin" ? "kündigen bis " + R.fmt(kj.bis) : kj.art === "jederzeit" ? "jederzeit kündbar" : "Verlängerung prüfen";
      return {
        href: `/akte/vertraege/${v.id}`, titel: String(v.kurzname), leise: !R.laeuft(v),
        rechts: v.beitrag ? euro(R.proMonat(v)) + "/Monat" : undefined,
        zusatz: [name(S.firmen, v.firmaId), v.status !== "aktiv" ? STATUS_VERTRAG[String(v.status)] : "", k].filter(Boolean).join(" · "),
      };
    };
    const sort = (a: Eintrag, b: Eintrag) => String(a.kurzname).localeCompare(String(b.kurzname), "de");
    const lfd = S.vertraege.filter((v) => R.laeuft(v)).sort(sort);
    if (!S.vertraege.length) return leer;
    return (
      <>
        <div id="versicherungen"><Gruppe titel="Versicherungen" eintraege={lfd.filter((v) => R.istVers(v)).map(zeile)} /></div>
        <div id="sonstige"><Gruppe titel="Weitere Verträge" eintraege={lfd.filter((v) => !R.istVers(v)).map(zeile)} /></div>
        <Gruppe titel="Angebote" eintraege={S.vertraege.filter((v) => v.status === "angebot").sort(sort).map(zeile)} />
        <Gruppe titel="Beendet" eintraege={S.vertraege.filter((v) => v.status === "beendet" || v.status === "ersetzt").sort(sort).map(zeile)} />
      </>
    );
  }
  if (bereich === "firmen") {
    if (!S.firmen.length) return leer;
    return <Gruppe titel="Alle Firmen" eintraege={S.firmen.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "de"))
      .map((f) => ({ href: `/akte/firmen/${f.id}`, titel: String(f.name), zusatz: [f.art, f.hotline ? "Hotline " + f.hotline : f.telefon].filter(Boolean).join(" · ") }))} />;
  }
  if (bereich === "dinge") {
    if (!S.dinge.length) return leer;
    const kats = Array.from(new Set([...R.ENUM.dingKat, ...S.dinge.map((d) => String(d.kategorie))]));
    return <>{kats.map((k) => (
      <div key={k} id={k.toLowerCase()}>
        <Gruppe titel={k} eintraege={S.dinge.filter((d) => d.kategorie === k).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"))
          .map((d) => ({ href: `/akte/dinge/${d.id}`, titel: String(d.name), leise: (d.status ?? "aktiv") !== "aktiv", zusatz: [d.hersteller, d.modell, d.jahr, d.status !== "aktiv" ? d.status : ""].filter(Boolean).join(" · ") }))} />
      </div>
    ))}</>;
  }
  if (bereich === "belege") {
    if (!S.belege.length) return leer;
    return <Gruppe titel="Alle Belege" eintraege={S.belege.slice().sort((a, b) => String(b.datum ?? "").localeCompare(String(a.datum ?? "")))
      .map((b) => ({ href: `/akte/belege/${b.id}`, titel: String(b.titel), rechts: b.betrag ? euro(Number(b.betrag)) : undefined,
        zusatz: [b.datum ? R.fmt(b.datum) : "", name(S.firmen, b.firmaId), b.steuer && b.steuer !== "-" ? "§ 35a" : "", R.gewBis(b) ? "Gewährleistung bis " + R.fmt(R.gewBis(b)) : ""].filter(Boolean).join(" · ") }))} />;
  }
  if (bereich === "termine") {
    const alle = R.alleFristen(S, heute).filter((f: { erledigt: boolean }) => !f.erledigt);
    if (!alle.length) return leer;
    return <Gruppe titel="Offene Termine und Fristen" eintraege={alle.map((f: { id: string; titel: string; datum: string | null; manuell?: boolean; vertragId?: string }) => ({
      href: f.manuell ? `/akte/termine/${f.id}` : f.vertragId ? `/akte/vertraege/${f.vertragId}` : "/",
      titel: f.titel, rechts: f.datum ? R.fmt(f.datum) : "", zusatz: f.manuell ? "eigener Termin" : "aus dem Vertrag berechnet",
    }))} />;
  }
  return null;
}

/* URL-Parameter gibt es erst zur Laufzeit: Inhalt hinter einer Lade-Grenze (Next.js 16, Cache Components). */
export default function Seite() {
  return (
    <Suspense fallback={<main className="seite"><p className="leise">Wird geladen …</p></main>}>
      <Liste />
    </Suspense>
  );
}

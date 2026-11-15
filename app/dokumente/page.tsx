"use client";
import Link from "next/link";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import * as R from "@/lib/regeln";

export default function Dokumente() {
  const { akte, fehler } = useAkte();
  const name = (l: { id: string; [k: string]: unknown }[] | undefined, id: unknown, f: string) => String(l?.find((x) => x.id === id)?.[f] ?? "");
  const liste = akte?.dokumente.slice().sort((a, b) => String(b.datum ?? "").localeCompare(String(a.datum ?? ""))) ?? [];
  return (
    <main className="seite">
      <Kopf />
      <div className="zeile">
        <h1>Dokumente</h1>
        <Link className="knopf" href="/dokumente/neu">+ Aufnehmen</Link>
      </div>
      {fehler && <p className="fehler" role="alert">{fehler}</p>}
      {!akte && !fehler && <p className="leise">Wird geladen …</p>}
      {akte && !liste.length && <p className="leise">Noch keine Dokumente.</p>}
      {liste.length > 0 && (
        <section className="karte">
          <ul className="liste">
            {liste.map((d) => (
              <li key={d.id} className="eintrag">
                <Link href={`/dokumente/${d.id}`} className="verweis">
                  <span className="zeile"><strong>{String(d.titel || d.typ)}</strong><span className="marke">{d.datum ? R.fmt(d.datum) : ""}</span></span>
                  <span className="leise">{[d.typ, name(akte?.vertraege, d.vertragId, "kurzname"), name(akte?.dinge, d.dingId, "name"), `${d.seiten} S.`].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

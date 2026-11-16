"use client";
/* Schadenfall: Sofortmaßnahmen und Hotlines zuerst (auch offline über /notfall.html), dann die Schadenfälle. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { hotlinesAus, notfallMerken } from "@/lib/geraet/schaden";
import { STATUS_SCHADEN } from "@/components/schaden/status";
import * as R from "@/lib/regeln";

type Fall = { id: string; datum: string; titel: string; status: string };

export default function Schaden() {
  const { akte, haushaltId, fehler } = useAkte();
  const [faelle, setFaelle] = useState<Fall[] | null>(null);
  const hotlines = akte ? hotlinesAus(akte) : [];
  useEffect(() => { if (akte) notfallMerken(akte); }, [akte]);

  useEffect(() => {
    if (!haushaltId) return;
    void supabaseBrowser().from("schadenfaelle").select("id, datum, titel, status").eq("haushalt_id", haushaltId).is("verworfen_am", null)
      .order("datum", { ascending: false }).then(({ data }) => setFaelle((data ?? []) as Fall[]));
  }, [haushaltId]);

  return (
    <main className="seite">
      <Kopf zurueck="/" text="Übersicht" />
      <h1>Schadenfall</h1>
      <section className="karte">
        <h2>Sofortmaßnahmen</h2>
        <ol className="punkte" style={{ listStyle: "decimal" }}>
          {(akte ? R.sofortListe(akte.einst) : R.SOFORT_STD).map((t: string) => <li key={t}>{t}</li>)}
        </ol>
      </section>
      <section className="karte">
        <h2>Hotlines</h2>
        {!akte && <p className="leise">Wird geladen …</p>}
        {akte && !hotlines.length && <p className="leise">Bei keiner laufenden Versicherung ist eine Hotline eingetragen (Firma → Hotline).</p>}
        <ul className="liste">
          {hotlines.map((h) => (
            <li key={h.vertrag + h.nummer} className="eintrag zeile">
              <span>{h.vertrag}{h.firma ? <span className="leise"> · {h.firma}</span> : null}</span>
              <a href={"tel:" + h.nummer.replace(/[^\d+]/g, "")}><strong>{h.nummer}</strong></a>
            </li>
          ))}
        </ul>
        <p className="leise">Auch ohne Internet erreichbar: In der installierten App erscheint ohne Verbindung automatisch die Notfallseite mit diesem Stand.</p>
      </section>
      <Link href="/schaden/neu" className="knopf gross">＋ Schaden erfassen und prüfen</Link>
      <section className="karte">
        <h2>Schadenfälle</h2>
        {faelle === null && !fehler && <p className="leise">Wird geladen …</p>}
        {faelle?.length === 0 && <p className="leise">Noch keine Schadenfälle.</p>}
        <ul className="liste">
          {faelle?.map((f) => (
            <li key={f.id} className="eintrag">
              <Link href={`/schaden/${f.id}`} className="verweis"><strong>{f.titel}</strong></Link>
              <span className="leise">{R.fmt(f.datum)} · {STATUS_SCHADEN[f.status] ?? f.status}</span>
            </li>
          ))}
        </ul>
        {fehler && <p className="fehler">{fehler}</p>}
      </section>
    </main>
  );
}

"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Kopf } from "@/components/akte/kopf";
import { useAkte, verwerfen } from "@/lib/akte/useAkte";
import { dokumentLoeschen } from "@/lib/geraet/speichern";
import { supabaseBrowser } from "@/lib/supabase/browser";
import * as R from "@/lib/regeln";

type SeiteAnsicht = { nr: number; text: string; url?: string };

function Dokument() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { akte, haushaltId, fehler } = useAkte();
  const [seiten, setSeiten] = useState<SeiteAnsicht[] | null>(null);
  const [meldung, setMeldung] = useState("");
  const d = akte?.dokumente.find((x) => x.id === id);

  useEffect(() => {
    if (!d) return;
    (async () => {
      const sb = supabaseBrowser();
      const [t, b] = await Promise.all([
        sb.from("dokument_seiten").select("nr, text").eq("dokument_id", id).order("nr"),
        sb.from("dokument_bilder").select("nr, pfad").eq("dokument_id", id).order("nr"),
      ]);
      const pfade = (b.data ?? []).map((x) => x.pfad as string);
      const urls = pfade.length ? (await sb.storage.from("dokumente").createSignedUrls(pfade, 600)).data ?? [] : [];
      const n = Math.max(t.data?.length ?? 0, pfade.length);
      setSeiten(Array.from({ length: n }, (_, i) => ({
        nr: i + 1,
        text: String(t.data?.find((x) => x.nr === i + 1)?.text ?? ""),
        url: urls.find((u) => u.path === `${haushaltId}/${id}/${i + 1}.jpg`)?.signedUrl ?? undefined,
      })));
    })();
  }, [d, id, haushaltId]);

  async function wegtun(endgueltig: boolean) {
    if (!haushaltId || !d) return;
    const frage = endgueltig
      ? "Dokument endgültig löschen? Bilder und Text werden gelöscht, Verweise (z. B. an Fassungen) verlieren das Dokument. Das lässt sich nicht rückgängig machen."
      : "Dokument verwerfen? Es zählt dann nirgends mehr mit.";
    if (!window.confirm(frage)) return;
    try {
      if (endgueltig) await dokumentLoeschen(haushaltId, d.id);
      else await verwerfen("dokumente", haushaltId, d.id);
      router.replace("/dokumente");
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : "Hat nicht geklappt.");
    }
  }

  return (
    <main className="seite">
      <Kopf zurueck="/dokumente" text="Dokumente" />
      {fehler && <p className="fehler">{fehler}</p>}
      {akte && !d && <p className="fehler">Dokument nicht gefunden.</p>}
      {d && (
        <>
          <h1>{String(d.titel || d.typ)}</h1>
          <section className="karte">
            <span className="leise">{[d.typ, d.datum ? R.fmt(d.datum) : "", d.gueltigVon ? "gültig ab " + R.fmt(d.gueltigVon) : "", `${d.seiten} Seite(n)`].filter(Boolean).join(" · ")}</span>
          </section>
          {!seiten && <p className="leise">Seiten werden geladen …</p>}
          {seiten?.map((s) => (
            <section key={s.nr} className="karte">
              <h2>Seite {s.nr}</h2>
              {/* bewusst <img>: signierte, private URL; kein Umweg über die Bildoptimierung von Vercel */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.url && <img src={s.url} alt={`Seite ${s.nr}, geschwärzt`} className="seitenbild" />}
              <details><summary>Text</summary><pre className="seitentext">{s.text || "(kein Text)"}</pre></details>
            </section>
          ))}
          <section className="karte">
            <h2>Entfernen</h2>
            <div className="knoepfe">
              <button className="zweitrangig" onClick={() => wegtun(false)}>Verwerfen</button>
              <button className="gefahr" onClick={() => wegtun(true)}>Endgültig löschen …</button>
            </div>
            {meldung && <p className="fehler">{meldung}</p>}
          </section>
        </>
      )}
    </main>
  );
}

export default function Seite() {
  return <Suspense fallback={<main className="seite"><p className="leise">Wird geladen …</p></main>}><Dokument /></Suspense>;
}

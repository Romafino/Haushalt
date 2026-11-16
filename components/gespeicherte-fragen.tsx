"use client";
/* Gespeicherte Fragen („Zur Akte“): Platzhalter-Fassung aus der Datenbank, Namen nur in der Anzeige. Verwerfen statt löschen. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { zurueckuebersetzen } from "@/lib/ki/frage";
import type { ListenEintrag } from "@/lib/schwaerzen/liste";
import * as R from "@/lib/regeln";

type Gespeichert = { id: string; frage: string; antwort: string; tochter: string | null; stichtag: string; quellen: { dokumentId: string; nr: number }[]; erstellt_am: string };

export function GespeicherteFragen({ haushaltId, liste, namen, neu }: { haushaltId: string; liste: ListenEintrag[]; namen: boolean; neu: number }) {
  const [daten, setDaten] = useState<Gespeichert[] | null>(null);
  const [fehler, setFehler] = useState("");
  const laden = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("fragen").select("id, frage, antwort, tochter, stichtag, quellen, erstellt_am")
      .eq("haushalt_id", haushaltId).is("verworfen_am", null).order("erstellt_am", { ascending: false }).limit(50);
    if (error) setFehler("Gespeicherte Fragen konnten nicht geladen werden."); else setDaten(data as Gespeichert[]);
  }, [haushaltId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void laden(); }, [laden, neu]);

  async function verwerfen(id: string) {
    const { error } = await supabaseBrowser().from("fragen").update({ verworfen_am: new Date().toISOString() }).eq("id", id).eq("haushalt_id", haushaltId);
    if (error) setFehler("Konnte nicht verworfen werden."); else void laden();
  }

  const zeig = (t: string) => (namen ? zurueckuebersetzen(t, liste) : t);
  if (!daten?.length && !fehler) return null;
  return (
    <section className="karte">
      <h2>Gespeicherte Fragen</h2>
      {fehler && <p className="fehler">{fehler}</p>}
      <ul className="liste">
        {daten?.map((f) => (
          <li key={f.id} className="eintrag">
            <details>
              <summary><strong>{zeig(f.frage)}</strong> <span className="leise">· {R.fmt(f.erstellt_am.slice(0, 10))}</span></summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{zeig(f.antwort)}</p>
              {f.tochter && <><h3>Für Tochter</h3><p style={{ whiteSpace: "pre-wrap" }}>{zeig(f.tochter)}</p></>}
              <p className="leise">Stand: {R.fmt(f.stichtag)}{f.quellen.length ? " · Quellen: " : ""}
                {Array.from(new Set(f.quellen.map((q) => q.dokumentId))).map((d, i) => <span key={d}>{i > 0 && ", "}<Link href={`/dokumente/${d}`}>Dokument</Link></span>)}
              </p>
              <button type="button" className="zweitrangig klein" onClick={() => verwerfen(f.id)}>Verwerfen</button>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

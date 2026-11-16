"use client";
/* Direkte Suche ohne KI: Einträge (Verträge, Firmen, Dinge, Belege, Termine, Dokumente, Schadenfälle) und Dokumentseiten.
   Kostet nichts, nichts geht an eine KI. Für die Seitensuche wird der Begriff vorher gegen die Schwärzliste ersetzt. */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { anonymisieren } from "@/lib/schwaerzen";
import { ausschnitt, eintraegeSuchen } from "@/lib/akte/suche";
import { sucheHolen } from "@/lib/geraet/frage-entwurf";
import { zurueckuebersetzen } from "@/lib/ki/frage";

type Fall = { id: string; titel: string; datum: string; status: string; beschreibung: string };
type Seite = { dokument_id: string; nr: number; text: string };

export default function Suche() {
  const { akte, haushaltId, fehler } = useAkte();
  const sl = useSchwaerzliste();
  const [q, setQ] = useState("");
  const [faelle, setFaelle] = useState<Fall[]>([]);
  const [seiten, setSeiten] = useState<Seite[] | null>(null);
  const [sucht, setSucht] = useState(false);
  const eingabe = useRef<HTMLInputElement>(null);

  useEffect(() => { if (sl.zustand === "unbekannt") void sl.pruefen(); }, [sl]);
  useEffect(() => {
    const t = sucheHolen();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t) setQ(t); else eingabe.current?.focus();
  }, []);
  useEffect(() => {
    if (!haushaltId) return;
    void supabaseBrowser().from("schadenfaelle").select("id, titel, datum, status, beschreibung").eq("haushalt_id", haushaltId).is("verworfen_am", null)
      .then(({ data }) => setFaelle((data ?? []) as Fall[]));
  }, [haushaltId]);

  const eintraege = useMemo(() => (akte ? eintraegeSuchen(akte, q, faelle) : []), [akte, q, faelle]);

  // Dokumentseiten: verzögert beim Tippen; Namen vorher durch Platzhalter ersetzen (gespeichert ist nur die geschwärzte Fassung)
  useEffect(() => {
    if (!haushaltId || q.trim().length < 3) return;
    const begriff = sl.zustand === "offen" ? anonymisieren(q, sl.liste).text : q;
    const zeit = setTimeout(async () => {
      setSucht(true);
      const { data } = await supabaseBrowser().rpc("seiten_suchen", { p_haushalt: haushaltId, p_frage: begriff });
      setSeiten((data ?? []) as Seite[]); setSucht(false);
    }, 350);
    return () => clearTimeout(zeit);
  }, [q, haushaltId, sl.zustand, sl.liste]);

  const treffer = q.trim().length >= 3 ? seiten : null;
  const titel = (id: string) => { const d = akte?.dokumente.find((x) => x.id === id); return String(d?.titel || d?.typ || "Dokument"); };
  const zeig = (t: string) => (sl.zustand === "offen" ? zurueckuebersetzen(t, sl.liste) : t);
  const leer = q.trim().length >= 2 && !eintraege.length && treffer !== null && !treffer.length && !sucht;

  return (
    <main className="seite">
      <Kopf zurueck="/" text="Übersicht" />
      <h1>Suchen</h1>
      <section className="karte" role="search">
        <input ref={eingabe} type="search" enterKeyHint="search" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} placeholder="z. B. Heizung, Hausrat, Diebstahl" aria-label="Suchbegriff" />
        <p className="leise">Sucht in allen Einträgen und im Text der Dokumente – ohne KI, kostenlos. Für Antworten mit Begründung: <Link href="/frage">Frag die Akte</Link>.</p>
      </section>
      {fehler && <p className="fehler">{fehler}</p>}

      {eintraege.length > 0 && (
        <section className="karte">
          <h2>Einträge</h2>
          <ul className="liste">
            {eintraege.map((t) => (
              <li key={t.col + t.id} className="eintrag">
                <Link href={t.href} className="verweis"><strong>{zeig(t.titel)}</strong></Link>
                <span className="leise">{t.art}{t.zusatz ? " · " + t.zusatz : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {treffer && treffer.length > 0 && (
        <section className="karte">
          <h2>In Dokumenten</h2>
          <ul className="liste">
            {treffer.map((s) => (
              <li key={s.dokument_id + s.nr} className="eintrag">
                <Link href={`/dokumente/${s.dokument_id}`} className="verweis"><strong>{titel(s.dokument_id)}</strong></Link>
                <span className="leise">Seite {s.nr}</span>
                <span>{zeig(ausschnitt(s.text, q))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sucht && <p className="leise">Dokumente werden durchsucht …</p>}
      {leer && <p className="leise">Nichts gefunden.</p>}
    </main>
  );
}

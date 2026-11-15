"use client";
import Link from "next/link";
import { useState } from "react";
import type { Akte, Eintrag } from "@/lib/akte/abbilden";
import { supabaseBrowser } from "@/lib/supabase/browser";
import * as R from "@/lib/regeln";

type Frist = { id: string; titel: string; datum: string | null; notiz?: string; tage: number | null; ueberfaellig: boolean; manuell?: boolean; vertragId?: string; dingId?: string; belegId?: string };

/* Abgeleitete Fristen, die man quittieren kann (die übrigen erledigen sich durch Eintragen, z. B. Bestätigung). */
const QUITTIERBAR = /^(kb|gew|luecke)_/;

const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const wann = (f: Frist) =>
  f.tage == null ? "ohne Datum" : f.tage < 0 ? `überfällig seit ${-f.tage} ${-f.tage === 1 ? "Tag" : "Tagen"}` : f.tage === 0 ? "heute" : f.tage === 1 ? "morgen" : `in ${f.tage} Tagen`;

export function Uebersicht({ akte: S, haushaltId, onGeaendert }: { akte: Akte; haushaltId: string; onGeaendert: () => Promise<void> }) {
  const heute: string = R.heute();
  const [fehler, setFehler] = useState("");

  async function erledigt(f: Frist) {
    setFehler("");
    const sb = supabaseBrowser();
    const { error } = f.manuell
      ? await sb.rpc("termin_erledigt", { p_haushalt_id: haushaltId, p_id: f.id })
      : await sb.from("termine").upsert({ haushalt_id: haushaltId, schluessel: f.id, abgeleitet: true, erledigt_fuer: f.datum }, { onConflict: "haushalt_id,schluessel" });
    if (error) return setFehler("Konnte nicht als erledigt markiert werden.");
    await onGeaendert();
  }
  const ziel = (f: Frist) => f.manuell ? `/akte/termine/${f.id}` : f.vertragId ? `/akte/vertraege/${f.vertragId}` : f.belegId ? `/akte/belege/${f.belegId}` : f.dingId ? `/akte/dinge/${f.dingId}` : null;
  const vorlauf = Number(S.einst.vorlaufTage) > 0 ? Number(S.einst.vorlaufTage) : 42;
  const wichtig: Frist[] = R.wichtig(S, heute, vorlauf);
  const fix = R.fixkosten(S.vertraege, S.fassungen, heute);
  const jahr = heute.slice(0, 4);
  const st35a = R.steuer35a(S.belege, jahr);
  const laufend = S.vertraege.filter((v: Eintrag) => R.laeuft(v));
  const dingeIn = (k: string) => S.dinge.filter((d) => d.kategorie === k && (d.status ?? "aktiv") === "aktiv").length;
  const bereiche: [string, number, string][] = [
    ["Versicherungen", laufend.filter((v) => R.istVers(v)).length, "/akte/vertraege#versicherungen"],
    ["Verträge", laufend.filter((v) => !R.istVers(v)).length, "/akte/vertraege#sonstige"],
    ["Haus", dingeIn("Haus"), "/akte/dinge#haus"],
    ["Auto", dingeIn("Auto"), "/akte/dinge#auto"],
    ["Geräte", dingeIn("Gerät"), "/akte/dinge#gerät"],
    ["Belege", S.belege.length, "/akte/belege"],
  ];

  return (
    <>
      <section className="karte">
        <h2>Jetzt wichtig</h2>
        {wichtig.length === 0 ? (
          <p className="leise">Nichts fällig in den nächsten {vorlauf} Tagen.</p>
        ) : (
          <ul className="liste">
            {wichtig.map((f) => (
              <li key={f.id} className={f.ueberfaellig ? "eintrag dringend" : "eintrag"}>
                <div className="zeile">
                  {ziel(f) ? <Link href={ziel(f)!} className="verweis"><strong>{f.titel}</strong></Link> : <strong>{f.titel}</strong>}
                  <span className="marke">{wann(f)}</span>
                </div>
                <span className="leise">{f.datum ? R.fmt(f.datum) : "–"}{f.notiz ? " · " + f.notiz : ""}</span>
                {(f.manuell || QUITTIERBAR.test(f.id)) && f.datum && (
                  <button className="klein zweitrangig" onClick={() => erledigt(f)}>Erledigt</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {fehler && <p className="fehler" role="alert">{fehler}</p>}
        <Link href="/akte/termine" className="leise">Alle Termine und Fristen →</Link>
      </section>

      <section className="kacheln" aria-label="Bereiche">
        {bereiche.map(([name, n, href]) => (
          <Link key={name} href={href} className="kachel">
            <span className="zahl">{n}</span>
            <span className="leise">{name}</span>
          </Link>
        ))}
      </section>
      <nav className="karte schnell" aria-label="Akte">
        <Link href="/akte/vertraege">Verträge</Link>
        <Link href="/akte/firmen">Firmen</Link>
        <Link href="/akte/dinge">Dinge</Link>
        <Link href="/akte/belege">Belege</Link>
        <Link href="/akte/termine">Termine</Link>
        <Link href="/leben">Lebensereignis</Link>
        <Link href="/schwaerzliste">Schwärzliste</Link>
      </nav>

      <section className="karte">
        <h2>Fixkosten</h2>
        <div className="zeile"><span>pro Monat</span><strong>{euro(fix.monat)}</strong></div>
        <div className="zeile"><span>pro Jahr</span><strong>{euro(fix.jahr)}</strong></div>
        <p className="leise">Laufende und gekündigte Verträge, einmalige Zahlungen zählen nicht.</p>
      </section>

      <section className="karte">
        <h2>§ 35a {jahr}</h2>
        {(["handwerker", "haushaltsnah"] as const).map((art) => {
          const s = st35a[art];
          return (
            <div key={art} className="eintrag">
              <div className="zeile">
                <span>{art === "handwerker" ? "Handwerkerleistungen" : "Haushaltsnahe Dienste"}</span>
                <strong>{euro(s.ermaessigung)}</strong>
              </div>
              <span className="leise">
                {s.anzahl} Beleg(e), anrechenbare Arbeitskosten {euro(s.anrechenbar)}, Höchstbetrag {euro(R.MAX35A[art])}
                {s.bar ? ` · ${s.bar} bar bezahlt, zählt nicht` : ""}
              </span>
            </div>
          );
        })}
        <p className="leise">Rechenhilfe, keine Steuerberatung. Beträge und Grenzen [prüfen].</p>
      </section>
    </>
  );
}

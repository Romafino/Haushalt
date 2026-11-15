"use client";
import type { Akte, Eintrag } from "@/lib/akte/abbilden";
import * as R from "@/lib/regeln";

type Frist = { id: string; titel: string; datum: string | null; notiz?: string; tage: number | null; ueberfaellig: boolean };

const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const wann = (f: Frist) =>
  f.tage == null ? "ohne Datum" : f.tage < 0 ? `überfällig seit ${-f.tage} ${-f.tage === 1 ? "Tag" : "Tagen"}` : f.tage === 0 ? "heute" : f.tage === 1 ? "morgen" : `in ${f.tage} Tagen`;

export function Uebersicht({ akte: S }: { akte: Akte }) {
  const heute: string = R.heute();
  const vorlauf = Number(S.einst.vorlaufTage) > 0 ? Number(S.einst.vorlaufTage) : 42;
  const wichtig: Frist[] = R.wichtig(S, heute, vorlauf);
  const fix = R.fixkosten(S.vertraege, S.fassungen, heute);
  const jahr = heute.slice(0, 4);
  const st35a = R.steuer35a(S.belege, jahr);
  const laufend = S.vertraege.filter((v: Eintrag) => R.laeuft(v));
  const dingeIn = (k: string) => S.dinge.filter((d) => d.kategorie === k && (d.status ?? "aktiv") === "aktiv").length;
  const bereiche: [string, number][] = [
    ["Versicherungen", laufend.filter((v) => R.istVers(v)).length],
    ["Verträge", laufend.filter((v) => !R.istVers(v)).length],
    ["Haus", dingeIn("Haus")],
    ["Auto", dingeIn("Auto")],
    ["Geräte", dingeIn("Gerät")],
    ["Belege", S.belege.length],
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
                  <strong>{f.titel}</strong>
                  <span className="marke">{wann(f)}</span>
                </div>
                <span className="leise">{f.datum ? R.fmt(f.datum) : "–"}{f.notiz ? " · " + f.notiz : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="kacheln" aria-label="Bereiche">
        {bereiche.map(([name, n]) => (
          <div key={name} className="kachel">
            <span className="zahl">{n}</span>
            <span className="leise">{name}</span>
          </div>
        ))}
      </section>

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

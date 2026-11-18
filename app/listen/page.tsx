"use client";
/* Eigene Auswahlwerte (Dokumenttyp, Vertragsart, Firmenart, Bereich für Dinge, Rolle). Gespeichert in den Haushalts-Einstellungen (eigene).
   Eingebaute Werte bleiben immer; eigene lassen sich entfernen, vorhandene Einträge behalten ihren Wert. */
import { useState } from "react";
import { Kopf } from "@/components/akte/kopf";
import { useAkte } from "@/lib/akte/useAkte";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { freitextPruefen } from "@/lib/akte/freitext";
import { listenTreffer } from "@/lib/schwaerzen/seitentext";
import { useSchwaerzliste } from "@/components/schwaerzliste/kontext";
import * as R from "@/lib/regeln";

const LISTEN = R.EIGEN_LISTEN as Record<string, string>;
const MAX = 40;

export default function EigeneListen() {
  const { akte, haushaltId, neuLaden } = useAkte();
  const sl = useSchwaerzliste();
  const [neu, setNeu] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);

  async function sichern(einst: Record<string, unknown>, k: string, text: string) {
    if (!haushaltId) return;
    setLaeuft(true);
    // frisch lesen, damit gleichzeitige Änderungen an anderen Einstellungen nicht verloren gehen
    const sb = supabaseBrowser();
    const h = await sb.from("haushalte").select("einstellungen").eq("id", haushaltId).single();
    const aktuell = (h.data?.einstellungen ?? {}) as Record<string, unknown>;
    const { error } = await sb.from("haushalte").update({ einstellungen: { ...aktuell, eigene: einst.eigene } }).eq("id", haushaltId);
    setMeldung((m) => ({ ...m, [k]: error ? "Konnte nicht gespeichert werden." : text }));
    await neuLaden();
    setLaeuft(false);
  }

  async function hinzufuegen(k: string) {
    if (!akte) return;
    const wert = (neu[k] ?? "").trim().replace(/\s+/g, " ");
    const fehler = !wert ? "Bitte einen Wert eingeben."
      : wert.length > MAX ? `Höchstens ${MAX} Zeichen.`
      : freitextPruefen(wert, "streng") ?? (listenTreffer(wert, sl.liste).length ? "Bitte keine Namen oder Angaben aus der Schwärzliste – der Wert geht beim Auslesen an die KI." : null);
    if (fehler) return setMeldung((m) => ({ ...m, [k]: fehler }));
    const einst = R.mitEigenem(akte.einst, k, wert);
    if (!einst) return setMeldung((m) => ({ ...m, [k]: "Diesen Wert gibt es schon." }));
    setNeu((n) => ({ ...n, [k]: "" }));
    await sichern(einst, k, `„${wert}“ hinzugefügt.`);
  }

  async function entfernen(k: string, wert: string) {
    if (!akte) return;
    const einst = R.ohneEigenes(akte.einst, k, wert);
    if (einst) await sichern(einst, k, `„${wert}“ entfernt. Vorhandene Einträge behalten den Wert.`);
  }

  const eigene = (akte?.einst.eigene ?? {}) as Record<string, string[]>;
  return (
    <main className="seite">
      <Kopf zurueck="/" text="Übersicht" />
      <h1>Eigene Listen</h1>
      <section className="karte">
        <p className="leise">Ergänze die Auswahllisten um eigene Werte. Sie erscheinen in allen Formularen, und die KI darf sie beim Auslesen vorschlagen. Keine Namen, Nummern oder IBAN – die Werte gehen beim Auslesen an die KI.</p>
      </section>
      {Object.entries(LISTEN).map(([k, titel]) => (
        <section key={k} className="karte">
          <h2>{titel}</h2>
          <p className="leise">Eingebaut: {(R.BASIS as Record<string, string[]>)[k].join(", ")}</p>
          {(eigene[k] ?? []).length > 0 && (
            <ul className="liste">
              {(eigene[k] ?? []).map((w) => (
                <li key={w} className="zeile">
                  <span>{w}</span>
                  <button type="button" className="zweitrangig" disabled={laeuft} onClick={() => entfernen(k, w)}>Entfernen</button>
                </li>
              ))}
            </ul>
          )}
          <form className="knoepfe" onSubmit={(e) => { e.preventDefault(); void hinzufuegen(k); }}>
            <input aria-label={`Neuer Wert für ${titel}`} maxLength={MAX} value={neu[k] ?? ""} onChange={(e) => setNeu((n) => ({ ...n, [k]: e.target.value }))} placeholder="Neuer Wert" />
            <button type="submit" disabled={laeuft || !akte}>Hinzufügen</button>
          </form>
          {meldung[k] && <p className="leise" role="status">{meldung[k]}</p>}
        </section>
      ))}
    </main>
  );
}

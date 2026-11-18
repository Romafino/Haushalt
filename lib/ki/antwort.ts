/* Antwort der KI lesen und prüfen. Reines Modul.
   1. JSON aus dem Text holen (auch wenn die KI Code-Zäune oder Vor-/Nachsätze schreibt)
   2. bereinigen() aus dem Regelmodul: nur bekannte Felder und Werte, keine Nummernfelder, nur vorhandene IDs
   3. Klartext-Sperre: Muster (IBAN, Nummern) dürfen auch in der Antwort nicht vorkommen */
import * as R from '@/lib/regeln';
import { ersetzen, kritisch } from '@/lib/schwaerzen/schutz';

export function jsonAus(text: string): unknown {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* weiter unten suchen */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* kein JSON */ } }
  return null;
}

export type Ids = { vertraege: string[]; dinge: string[]; firmen: string[] };

/** Bereinigter Vorschlag; Texte werden zusätzlich gegen Muster geschwärzt (falls die KI doch eine Nummer ausgibt). */
export function vorschlagAus(roh: unknown, ids: Ids, eigene?: unknown) {
  const v = R.bereinigen(roh, ids, eigene);
  return R.tief(v, (s: string) => textSauber(s));
}

/** Text der KI absichern: IBAN, Handynummern, Nummern hinter Bezeichnungen, Namen nach Herr/Frau, alte Daten → Platzhalter.
    Reine Datumsfelder (JJJJ-MM-TT, z. B. Vertragsbeginn) bleiben. */
export function textSauber(s: string): string {
  const t = String(s ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ersetzen(t, [], undefined, true);
}

/** Server-seitige Sperre: Kommt geschwärzter Text an, darf er keine IBAN und keine langen Nummern mehr enthalten. */
export function klartextVerdacht(texte: string[]): boolean {
  return texte.some((t) => kritisch(t));
}

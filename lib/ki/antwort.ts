/* Antwort der KI lesen und prüfen. Reines Modul.
   1. JSON aus dem Text holen (auch wenn die KI Code-Zäune oder Vor-/Nachsätze schreibt)
   2. bereinigen() aus dem Regelmodul: nur bekannte Felder und Werte, keine Nummernfelder, nur vorhandene IDs
   3. Klartext-Sperre: Muster (IBAN, Nummern) dürfen auch in der Antwort nicht vorkommen */
import * as R from '@/lib/regeln';
import { IBAN_RE } from '@/lib/schwaerzen';
import { nummernTreffer } from '@/lib/schwaerzen/seitentext';

export function jsonAus(text: string): unknown {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* weiter unten suchen */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* kein JSON */ } }
  return null;
}

export type Ids = { vertraege: string[]; dinge: string[]; firmen: string[] };

/** Bereinigter Vorschlag; Texte werden zusätzlich gegen Muster geschwärzt (falls die KI doch eine Nummer ausgibt). */
export function vorschlagAus(roh: unknown, ids: Ids) {
  const v = R.bereinigen(roh, ids);
  const sauber = (s: string) => {
    let t = s.replace(new RegExp(IBAN_RE.source, 'g'), '[IBAN]');
    for (const x of nummernTreffer(t).reverse()) t = t.slice(0, x.start) + '[Nummer]' + t.slice(x.ende);
    return t;
  };
  return R.tief(v, (s: string) => sauber(s));
}

/** Server-seitige Sperre: Kommt geschwärzter Text an, darf er keine IBAN und keine langen Nummern mehr enthalten. */
export function klartextVerdacht(texte: string[]): boolean {
  return texte.some((t) => new RegExp(IBAN_RE.source).test(t) || nummernTreffer(t).length > 0);
}

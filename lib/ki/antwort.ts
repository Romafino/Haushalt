/* Antwort der KI lesen und prüfen. Reines Modul.
   1. JSON aus dem Text holen (auch wenn die KI Code-Zäune oder Vor-/Nachsätze schreibt)
   2. bereinigen() aus dem Regelmodul: nur bekannte Felder und Werte, keine Nummernfelder, nur vorhandene IDs
   3. Klartext-Sperre: Muster (IBAN, Nummern) dürfen auch in der Antwort nicht vorkommen */
import * as R from '@/lib/regeln';
import { IBAN_RE } from '@/lib/schwaerzen';
import { alteDaten, nummernTreffer } from '@/lib/schwaerzen/seitentext';
import { ibanPlausibel } from '@/lib/schwaerzen/genauer';

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
  return R.tief(v, (s: string) => textSauber(s));
}

/** IBAN und lange Nummern in einem Text der KI durch Platzhalter ersetzen. */
export function textSauber(s: string): string {
  let t = String(s ?? '').replace(new RegExp(IBAN_RE.source, 'g'), (m) => (ibanPlausibel(m) ? '[IBAN]' : m));
  for (const x of nummernTreffer(t).reverse()) t = t.slice(0, x.start) + '[Nummer]' + t.slice(x.ende);
  for (const x of alteDaten(t).reverse()) t = t.slice(0, x.start) + '[Datum]' + t.slice(x.ende);
  return t;
}

/** Server-seitige Sperre: Kommt geschwärzter Text an, darf er keine IBAN und keine langen Nummern mehr enthalten. */
export function klartextVerdacht(texte: string[]): boolean {
  return texte.some((t) => [...t.matchAll(new RegExp(IBAN_RE.source, 'g'))].some((m) => ibanPlausibel(m[0])) || nummernTreffer(t).length > 0 || alteDaten(t).length > 0);
}

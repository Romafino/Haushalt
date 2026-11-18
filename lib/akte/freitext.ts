/* Freitext-Prüfung vor dem Speichern: keine Vertrags-, Kunden-, Rechnungsnummern, IBAN oder Geburtsdaten in der Akte
   (CLAUDE.md, Datenschutz Nr. 4). Nutzt die übernommene Schwärz-Erkennung. Reines Modul.
   Ergänzt 18.11.2026 (Wunsch): erlaubt sind Normbezeichnungen (DIN 18015, DIN EN ISO 9001:2015) und Telefon-/Faxnummern direkt hinter
   „Tel.“, „Telefon“, „Fax“, „Telefax“, „Hotline“ – außer Handynummern und Nummern aus der Schwärzliste (eigene Nummern der Familie). */
import { anonymisieren, treffer } from '@/lib/schwaerzen';
import { istMobil, telefonTreffer } from '@/lib/schwaerzen/genauer';
import type { ListenEintrag } from '@/lib/schwaerzen/liste';

export type Pruefung = 'streng' | 'normal' | 'keine';

const NORM = /\b(?:DIN|EN|ISO|IEC|VDE|VDI|DVGW)(?:[\s-]+(?:EN|ISO|IEC|VDE|SPEC|TS|TR))*[\s-]*\d[\d.:/-]*(?:\s?(?:Teil|T\.|Blatt)\s?\d+)?/gi;
const TEL = /\b(?:tel(?:efon)?|telefax|fax|hotline)\b\.?\s*:?\s*((?:\+|00)?\d[\d\s/().-]{4,}\d)/gi;

/** Stellen durch Leerzeichen ersetzen (Länge bleibt, damit nichts zusammenrutscht). */
const ausblenden = (t: string, a: number, b: number) => t.slice(0, a) + ' '.repeat(b - a) + t.slice(b);

/**
 * Gibt einen Hinweistext zurück, wenn der Text etwas enthält, das nicht gespeichert werden darf, sonst null.
 * streng: zusätzlich jede Ziffernfolge ab 5 Stellen (für Notiz, Titel, Kurzname); die gefundene Zahl wird genannt.
 * normal: IBAN, Geburtsdatum, Nummern hinter Bezeichnungen wie „Vertrags-Nr.“
 * liste: entsperrte Schwärzliste (für die Prüfung von Telefonnummern); null = gesperrt, Telefonnummern dann nicht erlaubt.
 */
export function freitextPruefen(text: unknown, art: Pruefung = 'streng', liste: ListenEintrag[] | null = null): string | null {
  if (art === 'keine' || typeof text !== 'string' || !text.trim()) return null;
  // erlaubte Stellen vorab ausblenden: Normen, Telefon-/Faxnummern mit Bezeichnung
  let t = text;
  for (const m of text.matchAll(NORM)) t = ausblenden(t, m.index!, m.index! + m[0].length);
  for (const m of text.matchAll(TEL)) {
    const nr = m[1], start = m.index! + m[0].length - nr.length;
    if (istMobil(nr, text.slice(Math.max(0, start - 8), start))) return `Bitte keine Handynummern eintragen (gefunden: ${nr.trim()}). Firmen-Handynummern ins Feld „Telefon“.`;
    if (liste === null) return `Telefonnummern in Notizen nur bei entsperrter Schwärzliste (gefunden: ${nr.trim()}) – sonst kann die App eure eigenen Nummern nicht erkennen.`;
    if (telefonTreffer(nr, liste).length) return `Diese Nummer steht in der Schwärzliste (gefunden: ${nr.trim()}) – eigene Nummern gehören nicht in die Akte.`;
    t = ausblenden(t, start, start + nr.length);
  }
  const a = anonymisieren(t, []).treffer;
  if (a.iban) return 'Bitte keine IBAN eintragen.';
  if (a.geburtsdatum) return 'Bitte kein Geburtsdatum eintragen.';
  if (a.nummer) return 'Bitte keine Vertrags-, Kunden- oder Rechnungsnummern eintragen.';
  if (art === 'streng') {
    const z = treffer(t, [], { ziffern: true }) as { start: number; ende: number }[];
    if (z.length) return `Bitte keine langen Nummern eintragen (gefunden: ${t.slice(z[0].start, z[0].ende).trim()}). Vertrags- und Kundennummern gehören in den Tresor.`;
  }
  return null;
}

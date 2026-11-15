/* Freitext-Prüfung vor dem Speichern: keine Vertrags-, Kunden-, Rechnungsnummern, IBAN oder Geburtsdaten in der Akte
   (CLAUDE.md, Datenschutz Nr. 4). Nutzt die übernommene Schwärz-Erkennung. Reines Modul. */
import { anonymisieren, treffer } from '@/lib/schwaerzen';

export type Pruefung = 'streng' | 'normal' | 'keine';

/** Gibt einen Hinweistext zurück, wenn der Text etwas enthält, das nicht gespeichert werden darf, sonst null.
    streng: zusätzlich jede Ziffernfolge ab 5 Stellen (für Notiz, Titel, Kurzname)
    normal: IBAN, Geburtsdatum, Nummern hinter Bezeichnungen wie „Vertrags-Nr.“ (z. B. für den Kündigungsweg mit Postanschrift) */
export function freitextPruefen(text: unknown, art: Pruefung = 'streng'): string | null {
  if (art === 'keine' || typeof text !== 'string' || !text.trim()) return null;
  const a = anonymisieren(text, []).treffer;
  if (a.iban) return 'Bitte keine IBAN eintragen.';
  if (a.geburtsdatum) return 'Bitte kein Geburtsdatum eintragen.';
  if (a.nummer) return 'Bitte keine Vertrags-, Kunden- oder Rechnungsnummern eintragen.';
  if (art === 'streng' && treffer(text, [], { ziffern: true }).length) return 'Bitte keine langen Nummern eintragen (z. B. Vertrags- oder Kundennummer).';
  return null;
}

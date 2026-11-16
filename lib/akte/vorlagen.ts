/* Terminvorlagen (KONZEPT 13.3): wiederkehrende Termine zum Antippen. Rhythmus vorbelegt und änderbar.
   Die Rhythmen sind übliche Vorschläge ohne Gewähr; maßgeblich sind Fahrzeugschein, Feuerstättenbescheid, Herstellerangaben [prüfen]. Reines Modul. */
import * as R from '@/lib/regeln';

export type Vorlage = { schluessel: string; titel: string; monate: number; bereich: string | null; hinweis: string };

export const VORLAGEN: Vorlage[] = [
  { schluessel: 'hu', titel: 'Hauptuntersuchung (TÜV)', monate: 24, bereich: 'Auto', hinweis: 'Pkw meist alle 2 Jahre, beim Neuwagen erstmals nach 3 Jahren – Datum steht auf der Plakette bzw. im Fahrzeugschein.' },
  { schluessel: 'heizung', titel: 'Heizungswartung', monate: 12, bereich: 'Haus', hinweis: 'Üblich ist jährlich; maßgeblich sind Hersteller oder Wartungsvertrag.' },
  { schluessel: 'schornstein', titel: 'Schornsteinfeger', monate: 12, bereich: 'Haus', hinweis: 'Termine und Abstände stehen im Feuerstättenbescheid; der Rhythmus hier ist nur ein Vorschlag.' },
  { schluessel: 'rauchmelder', titel: 'Rauchmelder prüfen', monate: 12, bereich: 'Haus', hinweis: 'Üblich ist eine Prüfung pro Jahr (Batterie, Funktion).' },
  { schluessel: 'reifen', titel: 'Reifenwechsel', monate: 6, bereich: 'Auto', hinweis: 'Faustregel „von O bis O“ (Oktober bis Ostern).' },
];

/** Nächster Termin: letztes Datum + Rhythmus; liegt das in der Vergangenheit, so oft weiter, bis es heute oder später ist. */
export function naechstesDatum(letztes: string, monate: number, heute: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(letztes) || !(monate >= 1 && monate <= 120)) throw new Error('Ungültige Eingabe');
  let d = R.addMonths(letztes, monate), n = 0;
  while (d < heute && n++ < 1000) d = R.addMonths(d, monate);
  return d;
}

export function vorlagenTitel(v: Vorlage, dingName?: string | null) {
  return dingName ? `${v.titel} – ${dingName}` : v.titel;
}

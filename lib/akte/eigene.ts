/* Eigener Auswahlwert direkt im Formular (18.11.2026): Prüfung, rein. Gespeichert wird über lib/geraet/eigene.ts. */
import { freitextPruefen } from './freitext';
import { listenTreffer } from '@/lib/schwaerzen/seitentext';
import type { ListenEintrag } from '@/lib/schwaerzen/liste';

export const MAX_EIGEN = 40;

/** Wert säubern (Leerzeichen) – leer, wenn nichts übrig bleibt. */
export const eigenerWert = (t: string) => String(t ?? '').trim().replace(/\s+/g, ' ');

/** Fehlertext oder null. Keine Nummern, IBAN, Geburtsdaten, keine Angaben aus der Schwärzliste (der Wert geht beim Auslesen an die KI). */
export function eigenerWertFehler(roh: string, liste: ListenEintrag[]): string | null {
  const wert = eigenerWert(roh);
  if (!wert) return 'Bitte einen Wert eingeben.';
  if (wert.length > MAX_EIGEN) return `Höchstens ${MAX_EIGEN} Zeichen.`;
  return freitextPruefen(wert, 'streng') ?? (listenTreffer(wert, liste).length ? 'Bitte keine Namen oder Angaben aus der Schwärzliste – der Wert geht beim Auslesen an die KI.' : null);
}

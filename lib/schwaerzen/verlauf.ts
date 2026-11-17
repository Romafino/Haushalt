/* Rückgängig/Wiederholen für die Balken einer Seite (Wunsch 17.11.2026). Reines Modul.
   Gespeichert werden ganze Balken-Stände; jede Änderung (ziehen, entfernen, Platzhalter ändern, zurücksetzen) ist ein Schritt. */
import type { Balken } from './seitentext';

export type Verlauf = { zurueck: Balken[][]; vor: Balken[][] };
export const MAX_SCHRITTE = 50;
export const leererVerlauf = (): Verlauf => ({ zurueck: [], vor: [] });

/** Vor einer Änderung: alten Stand merken, „Wiederholen“ verfällt. */
export function merken(v: Verlauf, alt: Balken[]): Verlauf {
  return { zurueck: [...v.zurueck, alt].slice(-MAX_SCHRITTE), vor: [] };
}

/** Letzten Schritt zurücknehmen; null, wenn nichts da ist. */
export function rueckgaengig(v: Verlauf, jetzt: Balken[]): { verlauf: Verlauf; balken: Balken[] } | null {
  if (!v.zurueck.length) return null;
  return { verlauf: { zurueck: v.zurueck.slice(0, -1), vor: [...v.vor, jetzt] }, balken: v.zurueck[v.zurueck.length - 1] };
}

/** Zurückgenommenen Schritt wiederholen; null, wenn nichts da ist. */
export function wiederholen(v: Verlauf, jetzt: Balken[]): { verlauf: Verlauf; balken: Balken[] } | null {
  if (!v.vor.length) return null;
  return { verlauf: { zurueck: [...v.zurueck, jetzt], vor: v.vor.slice(0, -1) }, balken: v.vor[v.vor.length - 1] };
}

/** Balken über Schwärzliste/Tresor, IBAN oder Handynummer: vor dem Entfernen warnen.
   Im gespeicherten Text bleibt die Stelle trotzdem ersetzt (seitenText prüft danach noch einmal). */
export function geschuetzt(b: Balken): boolean {
  return b.quelle === 'liste' || b.quelle === 'iban' || b.quelle === 'handy';
}

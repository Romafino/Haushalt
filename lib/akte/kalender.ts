/* Kalender-Abo: aus der Akte die .ics-Datei bauen, und den geheimen Schlüssel erzeugen/prüfen. Reines Modul.
   Notizen gehen bewusst nicht in den Kalender (Kalenderdienste speichern die Datei auf ihren Servern). */
import * as R from '@/lib/regeln';
import type { Akte } from './abbilden';

export const SCHLUESSEL_RE = /^[A-Za-z0-9_-]{43}$/;

/** 32 zufällige Bytes als base64url (43 Zeichen). */
export function neuerSchluessel(zufall: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)): string {
  const b = zufall(new Uint8Array(32));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 als Hex – so steht der Schlüssel in der Datenbank. */
export async function schluesselHash(schluessel: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(schluessel));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Termine ab 30 Tagen zurück, offen, mit Datum; ohne Notiz. */
export type KalenderTermin = { id: string; titel: string; datum: string; notiz?: undefined; [k: string]: unknown };
export function kalenderTermine(S: Akte, heute: string): KalenderTermin[] {
  const ab = R.addDays(heute, -30);
  return R.alleFristen(S, heute)
    .filter((f: { erledigt?: boolean; datum?: string | null }) => !f.erledigt && f.datum && f.datum >= ab)
    .map((f: KalenderTermin) => ({ ...f, notiz: undefined }));
}

export function kalenderIcs(S: Akte, heute: string, jetzt: Date): string {
  const vorlauf = Number(S.einst.vorlaufTage) > 0 ? Number(S.einst.vorlaufTage) : 42;
  const stempel = jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return R.icsText(kalenderTermine(S, heute), vorlauf, stempel)
    .replace('METHOD:PUBLISH\r\n', 'METHOD:PUBLISH\r\nX-WR-CALNAME:Haushalt\r\nREFRESH-INTERVAL;VALUE=DURATION:PT12H\r\nX-PUBLISHED-TTL:PT12H\r\n');
}

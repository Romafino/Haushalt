/* Push-Erinnerungen: welche Fristen heute eine Nachricht auslösen, und der Text dazu. Reines Modul.
   Ohne gespeicherten Zustand: Erinnert wird an festen Tagen vor dem Datum (Vorlauf, 14, 7, 1, 0) und einmal am Tag danach.
   Höchstens eine Nachricht je Haushalt und Tag; Inhalt nur Titel und Abstand (keine Notizen). */
import * as R from '@/lib/regeln';
import type { Akte } from './abbilden';

export const ERINNERN_AN = [14, 7, 1, 0, -1];

type Frist = { id: string; titel: string; datum?: string | null; tage: number | null; vorlauf?: number };

export function faelligeErinnerungen(S: Akte, heute: string): Frist[] {
  const vorlaufStd = Number(S.einst.vorlaufTage) > 0 ? Number(S.einst.vorlaufTage) : 42;
  return (R.wichtig(S, heute, vorlaufStd) as Frist[]).filter((f) => f.tage != null && (ERINNERN_AN.includes(f.tage) || f.tage === (f.vorlauf || vorlaufStd)));
}

const wann = (t: number) => (t === 0 ? 'heute' : t === 1 ? 'morgen' : t === -1 ? 'seit gestern überfällig' : `in ${t} Tagen`);

export type PushNachricht = { title: string; body: string; url: string; tag: string };

export function pushNachricht(fristen: Frist[], heute: string): PushNachricht | null {
  if (!fristen.length) return null;
  const zeilen = fristen.slice(0, 4).map((f) => `${f.titel} – ${wann(f.tage!)}`);
  if (fristen.length > 4) zeilen.push(`und ${fristen.length - 4} weitere`);
  return {
    title: fristen.length === 1 ? 'Frist im Haushalt' : `${fristen.length} Fristen im Haushalt`,
    body: zeilen.join('\n').slice(0, 600),
    url: '/',
    tag: 'haushalt-' + heute,
  };
}

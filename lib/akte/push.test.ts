/* Push-Erinnerungen: feste Tage, eine Nachricht, keine Notizen. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import * as R from '@/lib/regeln';
import { faelligeErinnerungen, pushNachricht } from './push';
import type { Akte } from './abbilden';

const H = '2026-11-15';
const akte = (fristen: Record<string, unknown>[]) => ({ firmen: [], dinge: [], belege: [], ereignisse: [], dokumente: [], fassungen: [], schadenfaelle: [], zaehler: [], vertraege: [], einst: {}, fristen } as unknown as Akte);
const t = (id: string, tage: number, extra: Record<string, unknown> = {}) => ({ id, titel: 'Termin ' + id, datum: R.addDays(H, tage), manuell: true, notiz: 'Max Mustermann', ...extra });

describe('Push-Erinnerungen', () => {
  it('nur an festen Tagen: Vorlauf, 14, 7, 1, 0 und einen Tag danach', () => {
    const S = akte([t('a', 42), t('b', 14), t('c', 7), t('d', 1), t('e', 0), t('f', -1), t('g', 13), t('h', -5), t('i', 5, { vorlaufTage: 5 })]);
    expect(faelligeErinnerungen(S, H).map((f) => f.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'i']);
  });

  it('erledigte Termine erinnern nicht', () => {
    expect(faelligeErinnerungen(akte([t('a', 7, { status: 'erledigt' })]), H)).toEqual([]);
  });

  it('eine Nachricht, höchstens 4 Zeilen plus Rest, ohne Notizen', () => {
    const S = akte([t('a', 0), t('b', 1), t('c', 7), t('d', 14), t('e', -1), t('f', 42)]);
    const n = pushNachricht(faelligeErinnerungen(S, H), H)!;
    expect(n.title).toBe('6 Fristen im Haushalt');
    expect(n.body.split('\n')).toHaveLength(5);
    expect(n.body).toContain('Termin e – seit gestern überfällig');
    expect(n.body).not.toContain('Mustermann');
    expect(n.tag).toBe('haushalt-' + H);
    expect(pushNachricht([], H)).toBeNull();
  });
});

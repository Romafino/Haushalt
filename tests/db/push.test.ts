// Push-Geräte: nur eigene Geräte im eigenen Haushalt. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, erika: Nutzer, fremd: Nutzer;
let haus: string;
const abo = (endpoint: string) => [endpoint, 'B' + 'x'.repeat(86), 'a'.repeat(22)];
const NEU = 'insert into public.push_abos (haushalt_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)';

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  erika = await nutzerAnlegen(db, 'erika@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($1, $3)', [haus, max.id, erika.id]);
  await db.query('insert into public.push_abos (haushalt_id, nutzer_id, endpoint, p256dh, auth) values ($1, $2, $3, $4, $5)', [haus, erika.id, ...abo('https://push.beispiel.invalid/erika')]);
});
afterAll(async () => { await db?.end(); });

describe('push_abos', () => {
  it('Mitglied legt eigenes Gerät an und sieht nur eigene Geräte', async () => {
    await als(db, max, async (q) => {
      await q(NEU, [haus, ...abo('https://push.beispiel.invalid/max')]);
      expect((await q('select endpoint from public.push_abos')).rows.map((r) => r.endpoint)).toEqual(['https://push.beispiel.invalid/max']);
      expect((await q('delete from public.push_abos where endpoint like $1', ['%erika'])).rowCount).toBe(0);
    });
  });

  it('kein Gerät für eine andere Person oder einen fremden Haushalt; nur https', async () => {
    await als(db, max, async (q) => {
      expect(await verweigert(q('insert into public.push_abos (haushalt_id, nutzer_id, endpoint, p256dh, auth) values ($1, $2, $3, $4, $5)', [haus, erika.id, ...abo('https://push.beispiel.invalid/x')]))).toBe(true);
      await expect(q(NEU, [haus, ...abo('http://push.beispiel.invalid/x')])).rejects.toMatchObject({ code: '23514' });
    });
    await als(db, fremd, async (q) => {
      expect(await verweigert(q(NEU, [haus, ...abo('https://push.beispiel.invalid/fremd')]))).toBe(true);
      expect((await q('select * from public.push_abos')).rowCount).toBe(0);
    });
  });

  it('anonym: kein Zugriff', async () => {
    await als(db, 'anon', async (q) => { expect(await verweigert(q('select * from public.push_abos'))).toBe(true); });
  });
});

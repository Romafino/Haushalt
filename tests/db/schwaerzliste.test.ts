// Schwärzliste in der Datenbank: nur verschlüsselt, nur Mitglieder. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { boxAnlegen } from '@/lib/schwaerzen/liste';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string;

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2)', [haus, max.id]);
});
afterAll(async () => { await db?.end(); });

const SPEICHERN = 'insert into public.schwaerzliste (haushalt_id, v, salz, iter, iv, daten) values ($1, 1, $2, $3, $4, $5) on conflict (haushalt_id) do update set salz = excluded.salz, iter = excluded.iter, iv = excluded.iv, daten = excluded.daten';

describe('schwaerzliste', () => {
  it('Mitglied speichert einen echten verschlüsselten Block; Stempel kommt vom Server', async () => {
    const { box } = await boxAnlegen('vier zufällige Wörter hier', [{ text: 'Max Mustermann', ersatz: '[Vater]' }]);
    await als(db, max, async (q) => {
      await q(SPEICHERN, [haus, box.salz, box.iter, box.iv, box.daten]);
      const z = (await q('select daten, geaendert_von from public.schwaerzliste where haushalt_id = $1', [haus])).rows[0];
      expect(z.daten).toBe(box.daten);
      expect(z.geaendert_von).toBe(max.id);
    });
  });

  it.each([
    ['Klartext als JSON', { daten: '{"liste":[{"text":"Max Mustermann"}]}' }],
    ['Klartext mit Leerzeichen', { daten: 'Max Mustermann Musterweg 5 Musterstadt' }],
    ['zu wenige Iterationen', { iter: 1000 }],
    ['kaputtes Salz', { salz: 'kein salz' }],
  ])('lehnt ab: %s', async (_, aenderung) => {
    const { box } = await boxAnlegen('vier zufällige Wörter hier', [], 1000);
    const b = { ...box, iter: 310000, ...aenderung };
    await als(db, max, async (q) => {
      await expect(q(SPEICHERN, [haus, b.salz, b.iter, b.iv, b.daten])).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('fremder Nutzer: liest nichts, schreibt nichts, löscht nichts', async () => {
    const { box } = await boxAnlegen('anderes langes Passwort', [], 1000);
    await db.query(SPEICHERN, [haus, box.salz, 310000, box.iv, box.daten]); // dauerhaft, als Eigentümer
    await als(db, fremd, async (q) => {
      expect((await q('select * from public.schwaerzliste where haushalt_id = $1', [haus])).rowCount).toBe(0);
      expect(await verweigert(q(SPEICHERN.replace(/ on conflict.*/, ''), [haus, box.salz, 310000, box.iv, box.daten]))).toBe(true);
      expect((await q('update public.schwaerzliste set daten = $2 where haushalt_id = $1', [haus, box.daten])).rowCount).toBe(0);
      expect((await q('delete from public.schwaerzliste where haushalt_id = $1', [haus])).rowCount).toBe(0);
    });
    await als(db, 'anon', async (q) => {
      expect(await verweigert(q('select * from public.schwaerzliste'))).toBe(true);
    });
    expect((await db.query('select count(*)::int as n from public.schwaerzliste where haushalt_id = $1', [haus])).rows[0].n).toBe(1);
  });
});

// Nummern-Tresor: nur verschlüsselter Block, nur Mitglieder. Ablageort als normales Feld. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string;
const BOX = ['B'.repeat(16), 'C'.repeat(40)];

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  const hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
  await db.query('insert into public.nummern_tresor (haushalt_id, iv, daten) values ($1, $2, $3)', [haus, ...BOX]);
});
afterAll(async () => { await db?.end(); });

describe('nummern_tresor', () => {
  it('Mitglied liest und schreibt den Block; Klartext wird abgewiesen', async () => {
    await als(db, max, async (q) => {
      expect((await q('select iv from public.nummern_tresor')).rowCount).toBe(1);
      expect((await q("update public.nummern_tresor set daten = $1 where haushalt_id = $2", ['D'.repeat(40), haus])).rowCount).toBe(1);
      await expect(q("update public.nummern_tresor set daten = 'Vertragsnummer HR-71206680' where haushalt_id = $1", [haus])).rejects.toMatchObject({ code: '23514' });
    });
  });
  it('fremder Nutzer liest, schreibt und löscht nichts; anonym kein Zugriff', async () => {
    await als(db, fremd, async (q) => {
      expect((await q('select * from public.nummern_tresor')).rowCount).toBe(0);
      expect((await q("update public.nummern_tresor set daten = $1", ['E'.repeat(40)])).rowCount).toBe(0);
      expect((await q('delete from public.nummern_tresor')).rowCount).toBe(0);
      expect(await verweigert(q('insert into public.nummern_tresor (haushalt_id, iv, daten) values ($1, $2, $3)', [haus, ...BOX]))).toBe(true);
    });
    await als(db, 'anon', async (q) => { expect(await verweigert(q('select * from public.nummern_tresor'))).toBe(true); });
  });
  it('Ablageort an Vertrag und Dokument (über dokument_speichern)', async () => {
    await als(db, max, async (q) => {
      const v = (await q("insert into public.vertraege (haushalt_id, kurzname, art, ablageort) values ($1, 'Hausrat', 'Versicherung', 'Ordner Versicherungen, Fach 3') returning ablageort", [haus])).rows[0];
      expect(v.ablageort).toBe('Ordner Versicherungen, Fach 3');
      const vid = (await q("select public.vertrag_speichern($1, null, $2::jsonb) as id", [haus, JSON.stringify({ kurzname: 'Strom', art: 'Strom/Gas', ablageort: 'Kundenportal' })])).rows[0].id;
      expect((await q('select ablageort from public.vertraege where id = $1', [vid])).rows[0].ablageort).toBe('Kundenportal');
      await q("select public.vertrag_speichern($1, $2, $3::jsonb)", [haus, vid, JSON.stringify({ ablageort: 'Ordner Strom' })]);
      expect((await q('select ablageort from public.vertraege where id = $1', [vid])).rows[0].ablageort).toBe('Ordner Strom');
      const id = (await q("select public.dokument_speichern($1, $2::jsonb, '[]', '[]') as id", [haus, JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', typ: 'Police', ablageort: 'Kundenportal' })])).rows[0].id;
      expect((await q('select ablageort from public.dokumente where id = $1', [id])).rows[0].ablageort).toBe('Kundenportal');
    });
  });
});

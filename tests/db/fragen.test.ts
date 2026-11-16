// Gespeicherte Fragen: nur Mitglieder lesen/schreiben. Erfundene Daten (Platzhalter-Fassung).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string;
const NEU = "insert into public.fragen (haushalt_id, frage, antwort, stichtag, quellen) values ($1, 'Ist [Vater] mitversichert?', 'Ja, Hausrat 2026, S. 2, § 3.', '2026-11-16', '[{\"nr\":2}]') returning id";

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  const hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
  await db.query(NEU, [haus]);
});
afterAll(async () => { await db?.end(); });

describe('fragen', () => {
  it('Mitglied speichert und liest; Ersteller wird gesetzt', async () => {
    await als(db, max, async (q) => {
      const id = (await q(NEU, [haus])).rows[0].id;
      expect((await q('select erstellt_von from public.fragen where id = $1', [id])).rows[0].erstellt_von).toBe(max.id);
      expect((await q('select count(*)::int as n from public.fragen')).rows[0].n).toBe(2);
    });
  });
  it('fremder Nutzer liest, schreibt und ändert nichts', async () => {
    await als(db, fremd, async (q) => {
      expect((await q('select * from public.fragen')).rowCount).toBe(0);
      expect(await verweigert(q(NEU, [haus]))).toBe(true);
      expect((await q("update public.fragen set antwort = 'x'")).rowCount).toBe(0);
      expect((await q('delete from public.fragen')).rowCount).toBe(0);
    });
  });
  it('anonym: kein Zugriff', async () => {
    await als(db, 'anon', async (q) => { expect(await verweigert(q('select * from public.fragen'))).toBe(true); });
  });
});

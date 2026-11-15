// Frag die Akte, Schritt 1: Volltextsuche über geschwärzte Seiten. Nur Mitglieder, nur nicht verworfene Dokumente. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string, d1: string, d2: string;
const SUCHE = 'select dokument_id, nr from public.seiten_suchen($1, $2)';

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  const hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
  d1 = randomUUID(); d2 = randomUUID();
  await db.query("insert into public.dokumente (id, haushalt_id, typ, titel, seiten) values ($1, $3, 'Police', 'Hausrat 2026', 2), ($2, $3, 'Police', 'Alt', 1)", [d1, d2, haus]);
  await db.query(`insert into public.dokument_seiten (haushalt_id, dokument_id, nr, text) values
    ($1, $2, 1, 'Versicherungsschein für [Vater]. Beitrag 120,00 € jährlich.'),
    ($1, $2, 2, '§ 3 Versicherte Gefahren: Feuer, Leitungswasser, Einbruchdiebstahl. Fahrräder sind bis 1.000 € mitversichert.'),
    ($1, $3, 1, 'Einbruchdiebstahl ist ausgeschlossen.')`, [haus, d1, d2]);
  await db.query('update public.dokumente set verworfen_am = now() where id = $1', [d2]);
});
afterAll(async () => { await db?.end(); });

describe('seiten_suchen', () => {
  it('findet Wortformen und Kompositum-Anfänge („Einbruch“ → „Einbruchdiebstahl“, „Fahrrad“ → „Fahrräder“)', async () => {
    await als(db, max, async (q) => {
      expect((await q(SUCHE, [haus, 'Ist ein Einbruch versichert?'])).rows.map((r) => r.nr)).toContain(2);
      expect((await q(SUCHE, [haus, 'Was kostet der Beitrag?'])).rows.map((r) => r.nr)).toEqual([1]);
      expect((await q(SUCHE, [haus, 'Ist mein Fahrrad mitversichert'])).rows.map((r) => r.nr)).toEqual([2]);
      expect((await q(SUCHE, [haus, 'Leitungswasserschaden'])).rowCount).toBe(0); // Grenze: längeres Wort als im Text
    });
  });

  it('verworfene Dokumente werden nicht durchsucht; leere Frage liefert nichts', async () => {
    await als(db, max, async (q) => {
      const r = await q(SUCHE, [haus, 'Einbruchdiebstahl']);
      expect(r.rows.every((x) => x.dokument_id === d1)).toBe(true);
      expect((await q(SUCHE, [haus, '?? !!'])).rowCount).toBe(0);
      expect((await q(SUCHE, [haus, null])).rowCount).toBe(0);
    });
  });

  it('höchstens 12 Treffer, auch wenn mehr verlangt', async () => {
    await als(db, max, async (q) => {
      expect((await q('select * from public.seiten_suchen($1, $2, 500)', [haus, 'Feuer Beitrag'])).rowCount).toBeLessThanOrEqual(12);
    });
  });

  it('fremder Nutzer findet nichts (RLS), auch mit der richtigen Haushalts-ID', async () => {
    await als(db, fremd, async (q) => {
      expect((await q(SUCHE, [haus, 'Feuer Beitrag Einbruch'])).rowCount).toBe(0);
    });
  });
});

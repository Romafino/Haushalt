// Kalender-Abo: nur Hash gespeichert, nur Mitglieder verwalten den Link, Abruf ohne Anmeldung nur mit passendem Schlüssel. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string, hausB: string;
const SCHLUESSEL = 'A'.repeat(20) + 'b'.repeat(20) + '_-9';
const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
  await db.query("insert into public.vertraege (haushalt_id, kurzname, art, beitrag, zahlweise, laufzeitende, frist_wert, frist_einheit) values ($1, 'Hausrat', 'Versicherung', 120, 'jaehrlich', '2027-03-31', 3, 'Monate')", [haus]);
  await db.query("insert into public.vertraege (haushalt_id, kurzname, art) values ($1, 'Fremdvertrag', 'Versicherung')", [hausB]);
});
afterAll(async () => { await db?.end(); });

describe('kalender_zugang', () => {
  it('Mitglied legt Link an (nur Hash); fremder Nutzer sieht und ändert nichts', async () => {
    await als(db, max, async (q) => {
      await q('insert into public.kalender_zugang (haushalt_id, hash) values ($1, $2)', [haus, hash(SCHLUESSEL)]);
      expect((await q('select hash from public.kalender_zugang')).rows).toEqual([{ hash: hash(SCHLUESSEL) }]);
    });
    // als() rollt zurück; für die folgenden Fälle bleibend anlegen
    await db.query('insert into public.kalender_zugang (haushalt_id, hash) values ($1, $2)', [haus, hash(SCHLUESSEL)]);
    await als(db, fremd, async (q) => {
      expect((await q('select * from public.kalender_zugang')).rowCount).toBe(0);
      expect((await q('update public.kalender_zugang set hash = $1 where haushalt_id = $2', ['0'.repeat(64), haus])).rowCount).toBe(0);
      expect((await q('delete from public.kalender_zugang where haushalt_id = $1', [haus])).rowCount).toBe(0);
      expect(await verweigert(q('insert into public.kalender_zugang (haushalt_id, hash) values ($1, $2)', [haus, '1'.repeat(64)]))).toBe(true);
    });
    expect(await verweigert(als(db, max, (q) => q("insert into public.kalender_zugang (haushalt_id, hash) values ($1, 'kein-hash')", [hausB])))).toBe(true);
  });

  it('anonym: Tabelle gesperrt; Abruf nur mit richtigem Schlüssel, liefert nur den eigenen Haushalt', async () => {
    await als(db, 'anon', async (q) => {
      expect(await verweigert(q('select * from public.kalender_zugang'))).toBe(true);
      const d = (await q('select public.kalender_daten($1) as d', [SCHLUESSEL])).rows[0].d;
      expect(d.vertraege.map((v: { kurzname: string }) => v.kurzname)).toEqual(['Hausrat']);
      expect(d.dokumente).toEqual([]);
      expect((await q('select public.kalender_daten($1) as d', ['B'.repeat(43)])).rows[0].d).toBeNull();
      expect((await q('select public.kalender_daten($1) as d', ['zu-kurz'])).rows[0].d).toBeNull();
      expect((await q('select public.kalender_daten($1) as d', [null])).rows[0].d).toBeNull();
    });
  });

  it('Link erneuern: alter Schlüssel gilt nicht mehr', async () => {
    const neu = 'Z'.repeat(43);
    await als(db, max, async (q) => {
      expect((await q('update public.kalender_zugang set hash = $1 where haushalt_id = $2', [hash(neu), haus])).rowCount).toBe(1);
    });
    await db.query('update public.kalender_zugang set hash = $1 where haushalt_id = $2', [hash(neu), haus]);
    await als(db, 'anon', async (q) => {
      expect((await q('select public.kalender_daten($1) as d', [SCHLUESSEL])).rows[0].d).toBeNull();
      expect((await q('select public.kalender_daten($1) as d', [neu])).rows[0].d).not.toBeNull();
    });
  });
});

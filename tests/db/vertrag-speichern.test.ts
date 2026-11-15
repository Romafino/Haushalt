// vertrag_speichern: Vertrag + Bezüge in einer Transaktion, mit den Rechten der Person (RLS). Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let hausA: string, hausB: string, auto: string, haus: string, dingB: string, firma: string;

const SPEICHERN = 'select public.vertrag_speichern($1, $2, $3::jsonb, $4::uuid[], $5::text[]) as id';

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  const haushalt = async (n: Nutzer, name: string) => {
    const h = (await db.query('insert into public.haushalte (name) values ($1) returning id', [name])).rows[0].id;
    await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2)', [h, n.id]);
    return h as string;
  };
  hausA = await haushalt(max, 'A');
  hausB = await haushalt(fremd, 'B');
  const id = async (sql: string, w: unknown[]) => (await db.query(sql, w)).rows[0].id as string;
  auto = await id("insert into public.dinge (haushalt_id, name, kategorie) values ($1, 'Kombi', 'Auto') returning id", [hausA]);
  haus = await id("insert into public.dinge (haushalt_id, name, kategorie) values ($1, 'Haus', 'Haus') returning id", [hausA]);
  dingB = await id("insert into public.dinge (haushalt_id, name) values ($1, 'Fremdes Ding') returning id", [hausB]);
  firma = await id("insert into public.firmen (haushalt_id, name) values ($1, 'Beispiel Versicherung AG') returning id", [hausA]);
});

afterAll(async () => {
  await db?.end();
});

const bezuege = async (q: (s: string, w?: unknown[]) => Promise<pg.QueryResult>, v: string) => ({
  dinge: (await q('select ding_id, haupt from public.vertrag_dinge where vertrag_id = $1 order by haupt desc, ding_id', [v])).rows,
  rollen: (await q('select rolle, haupt from public.vertrag_rollen where vertrag_id = $1 order by haupt desc, rolle', [v])).rows,
});

describe('vertrag_speichern', () => {
  it('legt Vertrag mit Bezügen an; erster Bezug ist Hauptbezug', async () => {
    await als(db, max, async (q) => {
      const daten = { kurzname: 'Kfz', art: 'Versicherung', firma_id: firma, beitrag: 480, zahlweise: 'jaehrlich', laufzeitende: '2026-12-31', frist_wert: 1, frist_einheit: 'Monate' };
      const v = (await q(SPEICHERN, [hausA, null, JSON.stringify(daten), [auto, haus], ['Vater', 'Familie']])).rows[0].id;
      const z = (await q('select kurzname, status, beitrag::float as beitrag, online, bestaetigt from public.vertraege where id = $1', [v])).rows[0];
      expect(z).toEqual({ kurzname: 'Kfz', status: 'aktiv', beitrag: 480, online: false, bestaetigt: false });
      const b = await bezuege(q, v);
      expect(b.dinge).toEqual([{ ding_id: auto, haupt: true }, { ding_id: haus, haupt: false }].sort((x, y) => Number(y.haupt) - Number(x.haupt) || x.ding_id.localeCompare(y.ding_id)));
      expect(b.rollen).toEqual([{ rolle: 'Vater', haupt: true }, { rolle: 'Familie', haupt: false }]);
    });
  });

  it('ändern: nur übergebene Felder, null leert ein Feld, Bezüge werden ersetzt', async () => {
    await als(db, max, async (q) => {
      const v = (await q(SPEICHERN, [hausA, null, JSON.stringify({ kurzname: 'Hausrat', art: 'Versicherung', beitrag: 120, notiz: 'alt' }), [haus], ['Familie']])).rows[0].id;
      await q(SPEICHERN, [hausA, v, JSON.stringify({ beitrag: 130, notiz: null }), [auto], []]);
      const z = (await q('select kurzname, beitrag::float as beitrag, notiz from public.vertraege where id = $1', [v])).rows[0];
      expect(z).toEqual({ kurzname: 'Hausrat', beitrag: 130, notiz: null });
      expect(await bezuege(q, v)).toEqual({ dinge: [{ ding_id: auto, haupt: true }], rollen: [] });
    });
  });

  it('alles oder nichts: ungültiger Bezug (Ding aus fremdem Haushalt) speichert gar nichts', async () => {
    await als(db, max, async (q) => {
      const vorher = (await q('select count(*)::int as n from public.vertraege')).rows[0].n;
      await expect(q(SPEICHERN, [hausA, null, JSON.stringify({ kurzname: 'Strom', art: 'Strom/Gas' }), [haus, dingB], []])).rejects.toMatchObject({ code: '23503' });
      expect((await q('select count(*)::int as n from public.vertraege')).rows[0].n).toBe(vorher);
    });
  });

  it('lehnt unbekannte Felder und doppelte Bezüge ab (z. B. haushalt_id, id)', async () => {
    await als(db, max, async (q) => {
      await expect(q(SPEICHERN, [hausA, null, JSON.stringify({ kurzname: 'x', art: 'Abo', haushalt_id: hausB }), [], []])).rejects.toMatchObject({ code: '22023' });
      await expect(q(SPEICHERN, [hausA, null, JSON.stringify({ kurzname: 'x', art: 'Abo', id: hausB }), [], []])).rejects.toMatchObject({ code: '22023' });
      await expect(q(SPEICHERN, [hausA, null, JSON.stringify({ kurzname: 'x', art: 'Abo' }), [haus, haus], []])).rejects.toMatchObject({ code: '22023' });
    });
  });

  it('fremder Nutzer: kann in Haushalt A nichts anlegen und Verträge von A nicht ändern', async () => {
    const v = (await db.query("insert into public.vertraege (haushalt_id, kurzname, art) values ($1, 'Handy', 'Handy/Internet') returning id", [hausA])).rows[0].id;
    await als(db, fremd, async (q) => {
      expect(await verweigert(q(SPEICHERN, [hausA, null, JSON.stringify({ kurzname: 'x', art: 'Abo' }), [], []]))).toBe(true);
      await expect(q(SPEICHERN, [hausA, v, JSON.stringify({ kurzname: 'gekapert' }), [], []])).rejects.toMatchObject({ code: 'P0002' });
      await expect(q(SPEICHERN, [hausB, v, JSON.stringify({ kurzname: 'gekapert' }), [], []])).rejects.toMatchObject({ code: 'P0002' });
    });
    expect((await db.query('select kurzname from public.vertraege where id = $1', [v])).rows[0].kurzname).toBe('Handy');
  });

  it('anonym: nicht aufrufbar', async () => {
    await als(db, 'anon', async (q) => {
      expect(await verweigert(q(SPEICHERN, [hausA, null, '{}', [], []]))).toBe(true);
    });
  });
});

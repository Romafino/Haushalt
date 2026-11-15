// termin_erledigt: erledigt markieren + nächsten wiederkehrenden Termin anlegen, in einer Transaktion. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import * as R from '@/lib/regeln';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

pg.types.setTypeParser(1082, (t) => t);
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

const termin = async (datum: string, monate: number | null) =>
  (await db.query("insert into public.termine (haushalt_id, titel, datum, wiederholung_monate, vorlauf_tage, notiz) values ($1, 'Heizungswartung', $2, $3, 14, 'jährlich') returning id", [haus, datum, monate])).rows[0].id as string;

describe('termin_erledigt', () => {
  it.each([['2026-01-31', 1], ['2026-11-20', 12], ['2027-02-28', 12], ['2026-08-31', 6]])('%s + %i Monate wie im Regelmodul', async (datum, monate) => {
    const t = await termin(datum, monate);
    await als(db, max, async (q) => {
      const neu = (await q('select public.termin_erledigt($1, $2) as id', [haus, t])).rows[0].id;
      expect((await q('select status from public.termine where id = $1', [t])).rows[0].status).toBe('erledigt');
      const n = (await q('select titel, datum, status, vorlauf_tage, wiederholung_monate, notiz from public.termine where id = $1', [neu])).rows[0];
      expect(n).toEqual({ titel: 'Heizungswartung', datum: R.addMonths(datum, monate), status: 'offen', vorlauf_tage: 14, wiederholung_monate: monate, notiz: 'jährlich' });
    });
  });

  it('ohne Wiederholung: nur erledigt, kein neuer Termin; zweimal geht nicht', async () => {
    const t = await termin('2026-12-01', null);
    await als(db, max, async (q) => {
      const vorher = (await q('select count(*)::int as n from public.termine')).rows[0].n;
      expect((await q('select public.termin_erledigt($1, $2) as id', [haus, t])).rows[0].id).toBeNull();
      expect((await q('select count(*)::int as n from public.termine')).rows[0].n).toBe(vorher);
      await expect(q('select public.termin_erledigt($1, $2)', [haus, t])).rejects.toMatchObject({ code: 'P0002' });
    });
  });

  it('fremder Nutzer und anonym: nichts zu machen', async () => {
    const t = await termin('2026-12-05', 12);
    await als(db, fremd, async (q) => {
      await expect(q('select public.termin_erledigt($1, $2)', [haus, t])).rejects.toMatchObject({ code: 'P0002' });
    });
    await als(db, 'anon', async (q) => {
      expect(await verweigert(q('select public.termin_erledigt($1, $2)', [haus, t]))).toBe(true);
    });
    expect((await db.query('select status from public.termine where id = $1', [t])).rows[0].status).toBe('offen');
  });
});

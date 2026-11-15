// Durchstich: Daten in die Tabellen schreiben, als angemeldetes Mitglied lesen, abbilden und mit dem Regelmodul rechnen.
// Datums- und Zahlenspalten werden wie bei Supabase (PostgREST) als Text gelesen. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { akteAus, type Rohdaten } from '@/lib/akte/abbilden';
import * as R from '@/lib/regeln';
import { als, datenbankAufbauen, nutzerAnlegen, type Nutzer } from './hilfe';

pg.types.setTypeParser(1082, (t) => t); // date → 'JJJJ-MM-TT'
let db: pg.Client;
let max: Nutzer;
let haus: string;

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  await db.query('begin');
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: max.id, role: 'authenticated' })]);
  haus = (await db.query("select public.haushalt_anlegen('Zuhause') as id")).rows[0].id;
  const id = async (sql: string, w: unknown[]) => (await db.query(sql, w)).rows[0].id as string;
  const firma = await id("insert into public.firmen (haushalt_id, name, hotline) values ($1, 'Beispiel Versicherung AG', '0800 111') returning id", [haus]);
  const auto = await id("insert into public.dinge (haushalt_id, name, kategorie) values ($1, 'Kombi', 'Auto') returning id", [haus]);
  const kfz = await id("insert into public.vertraege (haushalt_id, kurzname, art, firma_id, beitrag, zahlweise, laufzeitende, frist_wert, frist_einheit, verlaengerung) values ($1, 'Kfz', 'Versicherung', $2, 480, 'jaehrlich', '2026-12-31', 1, 'Monate', '12m') returning id", [haus, firma]);
  await db.query("insert into public.vertrag_dinge (haushalt_id, vertrag_id, ding_id, haupt) values ($1, $2, $3, true)", [haus, kfz, auto]);
  await db.query("insert into public.vertraege (haushalt_id, kurzname, art, beitrag, zahlweise, status) values ($1, 'Strom', 'Strom/Gas', 90, 'monatlich', 'aktiv')", [haus]);
  await db.query("insert into public.vertraege (haushalt_id, kurzname, art, beitrag, zahlweise, status) values ($1, 'Altes Abo', 'Abo', 50, 'monatlich', 'beendet')", [haus]);
  await db.query("insert into public.belege (haushalt_id, titel, datum, arbeitskosten, steuer, unbar) values ($1, 'Heizung', '2026-05-10', 7000, 'handwerker', true), ($1, 'Bar bezahlt', '2026-06-01', 500, 'handwerker', false)", [haus]);
  await db.query("insert into public.termine (haushalt_id, titel, datum) values ($1, 'Schornsteinfeger', '2026-11-20')", [haus]);
  await db.query('commit');
});

afterAll(async () => {
  await db?.end();
});

async function lesen(): Promise<Rohdaten> {
  return als(db, max, async (q) => {
    const t = async (name: string) => (await q(`select * from public.${name} where haushalt_id = $1`, [haus])).rows;
    return {
      haushalt: (await q('select einstellungen from public.haushalte where id = $1', [haus])).rows[0],
      firmen: await t('firmen'), dinge: await t('dinge'), vertraege: await t('vertraege'), vertrag_dinge: await t('vertrag_dinge'),
      vertrag_rollen: await t('vertrag_rollen'), fassungen: await t('fassungen'), belege: await t('belege'), termine: await t('termine'), ereignisse: await t('ereignisse'),
    };
  });
}

describe('Akte aus der Datenbank → Regelmodul', () => {
  it('Jetzt wichtig, Fixkosten, §35a und Kfz-Erkennung stimmen', async () => {
    const S = akteAus(await lesen());
    const tag = '2026-11-15';
    const vorlauf = Number(S.einst.vorlaufTage);
    expect(vorlauf).toBe(42);
    const wichtig = R.wichtig(S, tag, vorlauf).map((f: { titel: string; datum: string; tage: number }) => [f.titel, f.datum, f.tage]);
    expect(wichtig).toEqual([['Schornsteinfeger', '2026-11-20', 5], ['Kfz: kündigen bis (Zugang)', '2026-11-30', 15]]);
    expect(R.fixkosten(S.vertraege, S.fassungen, tag)).toEqual({ monat: 130, jahr: 1560 }); // 480/12 + 90, beendetes Abo zählt nicht
    const st = R.steuer35a(S.belege, 2026).handwerker;
    expect([st.arbeit, st.anrechenbar, st.ermaessigung, st.bar]).toEqual([7500, 7000, 1200, 1]);
    expect(R.istKfz(S.vertraege.find((v) => v.kurzname === 'Kfz'), S)).toBe(true);
  });
});

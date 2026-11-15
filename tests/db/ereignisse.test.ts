// Ereignisse mit Folgen: Regelmodul → opsUebersetzen → ops_anwenden (eine Transaktion) → Akte neu laden. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { akteAus, type Akte, type Eintrag } from '@/lib/akte/abbilden';
import { opsUebersetzen, type DbOp } from '@/lib/akte/ops';
import * as R from '@/lib/regeln';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

pg.types.setTypeParser(1082, (t) => t);
let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string, hausB: string;
const T = '2026-11-15';

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
});
afterAll(async () => { await db?.end(); });

const id = async (sql: string, w: unknown[]) => (await db.query(sql, w)).rows[0].id as string;

async function akte(): Promise<Akte> {
  return als(db, max, async (q) => {
    const t = async (n: string) => (await q(`select * from public.${n} where haushalt_id = $1 and (${n === 'vertrag_dinge' || n === 'vertrag_rollen' ? 'true' : 'verworfen_am is null'})`, [haus])).rows;
    return akteAus({ haushalt: { einstellungen: {} }, firmen: await t('firmen'), dinge: await t('dinge'), vertraege: await t('vertraege'), vertrag_dinge: await t('vertrag_dinge'),
      vertrag_rollen: await t('vertrag_rollen'), fassungen: await t('fassungen'), belege: await t('belege'), termine: await t('termine'), ereignisse: await t('ereignisse') });
  });
}
async function anwenden(ops: DbOp[], nutzer: Nutzer = max, h = haus) {
  // dauerhaft (commit), damit die nächste Prüfung den Stand sieht
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: nutzer.id, role: 'authenticated' })]);
    const n = (await db.query('select public.ops_anwenden($1, $2::jsonb) as n', [h, JSON.stringify(ops)])).rows[0].n;
    await db.query('commit');
    return n as number;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
const vertrag = (S: Akte, vid: string) => S.vertraege.find((v) => v.id === vid) as Eintrag;

describe('Beitragserhöhung (Versicherung)', () => {
  it('Fassung alt geschlossen, neue Fassung, Beitrag neu, Sonderkündigung als Termin, Zeitleiste', async () => {
    const vid = await id("insert into public.vertraege (haushalt_id, kurzname, art, status, beitrag, zahlweise, beginn, laufzeitende, frist_wert, frist_einheit, verlaengerung) values ($1, 'Hausrat', 'Versicherung', 'aktiv', 120, 'jaehrlich', '2024-01-01', '2027-12-31', 3, 'Monate', '12m') returning id", [haus]);
    let S = await akte();
    const f = R.ereignisFolgen('erhoehung', vertrag(S, vid), { beitrag: 150, gueltigAb: '2027-01-01', zugang: T }, S, T);
    expect(await anwenden(opsUebersetzen(f.ops, S))).toBe(f.ops.length);
    S = await akte();
    const v = vertrag(S, vid);
    expect(v.beitrag).toBe(150);
    const fs = S.fassungen.filter((x) => x.vertragId === vid).sort((a, b) => String(a.gueltigVon).localeCompare(String(b.gueltigVon)));
    expect(fs.map((x) => [x.gueltigVon, x.gueltigBis ?? null, x.beitrag])).toEqual([['2024-01-01', '2026-12-31', 120], ['2027-01-01', null, 150]]);
    expect(R.standAm(v, S.fassungen, '2026-06-01').beitrag).toBe(120);
    expect(R.standAm(v, S.fassungen, '2027-06-01').beitrag).toBe(150);
    expect(S.fristen.map((x) => [x.titel, x.datum])).toContainEqual(['Hausrat: Sonderkündigung nach Beitragserhöhung möglich bis (Zugang)', '2026-12-15']);
    expect(S.ereignisse.filter((e) => e.vertragId === vid).map((e) => e.typ)).toEqual(['erhoehung']);
  });
});

describe('Kündigung und Bestätigung', () => {
  it('gekündigt zum, Abbuchung prüfen als Termin; Bestätigung mit anderem Datum verschiebt den Termin', async () => {
    const vid = await id("insert into public.vertraege (haushalt_id, kurzname, art, status, beitrag, zahlweise, laufzeitende, frist_wert, frist_einheit, verlaengerung) values ($1, 'Handy', 'Handy/Internet', 'aktiv', 20, 'monatlich', '2027-01-31', 1, 'Monate', 'unbefristet') returning id", [haus]);
    let S = await akte();
    let f = R.ereignisFolgen('kuendigung', vertrag(S, vid), { am: T }, S, T);
    await anwenden(opsUebersetzen(f.ops, S));
    S = await akte();
    expect(vertrag(S, vid)).toMatchObject({ status: 'gekuendigt', gekuendigtAm: T, gekuendigtZum: '2027-01-31', bestaetigt: false });
    expect(S.fristen.find((x) => x.vertragId === vid)).toMatchObject({ titel: 'Handy: Abbuchung nach Vertragsende geprüft?', datum: '2027-03-02', quelle: 'kuendigung' });
    expect(R.wichtig(S, '2026-12-01', 42).map((x: { id: string }) => x.id)).toContain('best_' + vid);

    f = R.ereignisFolgen('bestaetigung', vertrag(S, vid), { zum: '2027-02-28' }, S, T);
    await anwenden(opsUebersetzen(f.ops, S));
    S = await akte();
    expect(vertrag(S, vid)).toMatchObject({ bestaetigt: true, gekuendigtZum: '2027-02-28' });
    expect(S.fristen.find((x) => x.vertragId === vid)?.datum).toBe('2027-03-30');
    expect(R.wichtig(S, '2026-12-01', 42).map((x: { id: string }) => x.id)).not.toContain('best_' + vid);
  });
});

describe('Täglicher Lauf (wartung)', () => {
  it('verpasste Frist mit 12-Monats-Verlängerung wird fortgeschrieben; zweiter Lauf ändert nichts', async () => {
    const vid = await id("insert into public.vertraege (haushalt_id, kurzname, art, status, beitrag, zahlweise, beginn, laufzeitende, frist_wert, frist_einheit, verlaengerung) values ($1, 'Strom', 'Strom/Gas', 'aktiv', 90, 'monatlich', '2025-11-01', '2026-10-31', 1, 'Monate', '12m') returning id", [haus]);
    let S = await akte();
    const ops = R.wartung(S, T).filter((o: { id?: string; data?: { vertragId?: string } }) => o.id === vid || o.data?.vertragId === vid);
    expect(ops.length).toBeGreaterThan(0);
    await anwenden(opsUebersetzen(ops, S));
    S = await akte();
    expect(vertrag(S, vid).laufzeitende).toBe('2027-10-31');
    expect(S.ereignisse.find((e) => e.vertragId === vid)).toMatchObject({ id: 'auto_' + vid + '_verl_2027-10-31', typ: 'verlaengerung' });
    const zweiter = R.wartung(S, T).filter((o: { id?: string; data?: { vertragId?: string } }) => o.id === vid || o.data?.vertragId === vid);
    expect(zweiter).toEqual([]);
  });

  it('gekündigter Vertrag nach dem Ende wird beendet; Ende-Eintrag entsteht nur einmal', async () => {
    const vid = await id("insert into public.vertraege (haushalt_id, kurzname, art, status, gekuendigt_zum, bestaetigt) values ($1, 'Altes Abo', 'Abo', 'gekuendigt', '2026-10-31', true) returning id", [haus]);
    let S = await akte();
    const nur = (S2: Akte) => R.wartung(S2, T).filter((o: { id?: string; data?: { vertragId?: string } }) => o.id === vid || o.data?.vertragId === vid || o.id === 'auto_' + vid + '_ende');
    await anwenden(opsUebersetzen(nur(S), S));
    await anwenden(opsUebersetzen(nur(S), S)); // gleicher Lauf zweimal: Schlüssel verhindert Doppel
    S = await akte();
    expect(vertrag(S, vid).status).toBe('beendet');
    expect(S.ereignisse.filter((e) => e.vertragId === vid).map((e) => e.id)).toEqual(['auto_' + vid + '_ende']);
  });
});

describe('Ding verkauft', () => {
  it('Ding-Status und Prüftermine für verknüpfte laufende Verträge in einem Schritt', async () => {
    const did = await id("insert into public.dinge (haushalt_id, name, kategorie) values ($1, 'Kombi', 'Auto') returning id", [haus]);
    const vid = await id("insert into public.vertraege (haushalt_id, kurzname, art, status) values ($1, 'Kfz', 'Versicherung', 'aktiv') returning id", [haus]);
    await db.query('insert into public.vertrag_dinge (haushalt_id, vertrag_id, ding_id, haupt) values ($1, $2, $3, true)', [haus, vid, did]);
    let S = await akte();
    const d = { ...S.dinge.find((x) => x.id === did)!, status: 'verkauft' };
    const f = R.dingFolgen(d, 'aktiv', S, T);
    await anwenden([{ art: 'aendern', tabelle: 'dinge', id: did, daten: { status: 'verkauft' } }, ...opsUebersetzen(f.ops, S)]);
    S = await akte();
    expect(S.dinge.find((x) => x.id === did)?.status).toBe('verkauft');
    expect(S.fristen.find((x) => x.vertragId === vid && x.dingId === did)).toMatchObject({ titel: 'Prüfen: Kfz nach Verkauf von Kombi', datum: '2026-11-22' });
  });
});

describe('Lebensereignis', () => {
  it('Tochter zieht um: Aufgaben und Prüftermine für Verträge der Rolle Tochter', async () => {
    const vid = await id("insert into public.vertraege (haushalt_id, kurzname, art, status) values ($1, 'Haftpflicht', 'Versicherung', 'aktiv') returning id", [haus]);
    await db.query("insert into public.vertrag_rollen (haushalt_id, vertrag_id, rolle, haupt) values ($1, $2, 'Familie', true), ($1, $2, 'Tochter', false)", [haus, vid]);
    let S = await akte();
    const f = R.lebensFolgen('umzug', '2027-04-01', S, T, undefined);
    await anwenden(opsUebersetzen(f.ops, S));
    S = await akte();
    const neu = S.fristen.filter((x) => x.quelle === 'leben');
    expect(neu.length).toBe(R.LEBEN.umzug.aufgaben.length + 1);
    expect(neu.find((x) => x.vertragId === vid)?.titel).toBe('Tochter zieht um: Vertrag „Haftpflicht“ prüfen');
    expect(S.ereignisse.find((e) => e.typ === 'leben')?.text).toBe('Tochter zieht um');
  });
});

describe('ops_anwenden: Sicherheit und alles-oder-nichts', () => {
  it('Fehler im letzten Schritt: nichts wird gespeichert', async () => {
    const vorher = (await db.query('select count(*)::int as n from public.termine')).rows[0].n;
    await expect(anwenden([
      { art: 'neu', tabelle: 'termine', daten: { titel: 'A', datum: '2026-12-01' } },
      { art: 'aendern', tabelle: 'vertraege', id: '00000000-0000-0000-0000-000000000000', daten: { beitrag: 1 } },
    ])).rejects.toMatchObject({ code: 'P0002' });
    expect((await db.query('select count(*)::int as n from public.termine')).rows[0].n).toBe(vorher);
  });

  it.each([
    [{ art: 'neu', tabelle: 'mitglieder', daten: { nutzer_id: '00000000-0000-0000-0000-000000000000' } }],
    [{ art: 'neu', tabelle: 'termine', daten: { titel: 'x', haushalt_id: '00000000-0000-0000-0000-000000000000' } }],
    [{ art: 'neu', tabelle: 'termine', daten: { titel: 'x', gibtsnicht: 1 } }],
    [{ art: 'neu', tabelle: 'termine', daten: { titel: 'x', id: '00000000-0000-0000-0000-000000000000' } }],
    [{ art: 'schluessel', tabelle: 'vertraege', schluessel: 'x', daten: { kurzname: 'x' } }],
    [{ art: 'loeschen', tabelle: 'termine', daten: {} }],
  ])('lehnt ab: %j', async (op) => {
    await expect(anwenden([op as unknown as DbOp])).rejects.toMatchObject({ code: '22023' });
  });

  it('fremder Nutzer: kann in A nichts anlegen und nichts ändern', async () => {
    const vid = await id("insert into public.vertraege (haushalt_id, kurzname, art) values ($1, 'Rechtsschutz', 'Versicherung') returning id", [haus]);
    await als(db, fremd, async (q) => {
      expect(await verweigert(q('select public.ops_anwenden($1, $2::jsonb)', [haus, JSON.stringify([{ art: 'neu', tabelle: 'termine', daten: { titel: 'x' } }])]))).toBe(true);
      await expect(q('select public.ops_anwenden($1, $2::jsonb)', [haus, JSON.stringify([{ art: 'aendern', tabelle: 'vertraege', id: vid, daten: { kurzname: 'gekapert' } }])])).rejects.toMatchObject({ code: 'P0002' });
      await expect(q('select public.ops_anwenden($1, $2::jsonb)', [hausB, JSON.stringify([{ art: 'aendern', tabelle: 'vertraege', id: vid, daten: { kurzname: 'gekapert' } }])])).rejects.toMatchObject({ code: 'P0002' });
    });
    await als(db, 'anon', async (q) => {
      expect(await verweigert(q('select public.ops_anwenden($1, $2::jsonb)', [haus, '[]']))).toBe(true);
    });
    expect((await db.query('select kurzname from public.vertraege where id = $1', [vid])).rows[0].kurzname).toBe('Rechtsschutz');
  });
});

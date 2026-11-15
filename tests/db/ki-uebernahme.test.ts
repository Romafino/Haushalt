// Vorschlag übernehmen: uebernahme() → dokument_speichern (eine Transaktion) → Akte. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { akteAus, type Akte } from '@/lib/akte/abbilden';
import { startAuswahl, uebernahme, type Vorschlag } from '@/lib/ki/uebernahme';
import * as R from '@/lib/regeln';
import { datenbankAufbauen, nutzerAnlegen, type Nutzer } from './hilfe';

pg.types.setTypeParser(1082, (t) => t);
let db: pg.Client;
let max: Nutzer;
let haus: string;
const T = '2026-11-15';

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2)', [haus, max.id]);
});
afterAll(async () => { await db?.end(); });

async function alsMax<T>(f: () => Promise<T>): Promise<T> {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: max.id, role: 'authenticated' })]);
    const r = await f(); await db.query('commit'); return r;
  } catch (e) { await db.query('rollback'); throw e; }
}
async function akte(): Promise<Akte> {
  const t = async (n: string) => (await db.query(`select * from public.${n} where haushalt_id = $1`, [haus])).rows;
  return akteAus({ haushalt: { einstellungen: {} }, firmen: await t('firmen'), dinge: await t('dinge'), vertraege: await t('vertraege'), vertrag_dinge: await t('vertrag_dinge'),
    vertrag_rollen: await t('vertrag_rollen'), fassungen: await t('fassungen'), belege: await t('belege'), termine: await t('termine'), ereignisse: await t('ereignisse'), dokumente: await t('dokumente') });
}
async function speichern(v: Vorschlag, aenderung: Partial<ReturnType<typeof startAuswahl>> = {}) {
  const S = await akte(), id = randomUUID();
  const u = uebernahme(v, { ...startAuswahl(v), ...aenderung }, S, { dokumentId: id, heute: T, neueId: randomUUID });
  const dok = { id, ...Object.fromEntries(Object.entries({ typ: u.meta.typ, titel: u.meta.titel, datum: u.meta.datum, gueltig_von: u.meta.gueltigVon, gueltig_bis: u.meta.gueltigBis, vertrag_id: u.meta.vertragId, ding_id: u.meta.dingId, firma_id: u.meta.firmaId, steckbrief: u.meta.steckbrief }).filter(([, x]) => x != null)) };
  await alsMax(() => db.query('select public.dokument_speichern($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)', [haus, JSON.stringify(dok), JSON.stringify([{ nr: 1, text: 'x' }]), '[]', JSON.stringify(u.ops)]));
  return { id, u };
}
const leerV = (): Vorschlag => ({ dokument: {}, firma: {}, vertrag: {}, beleg: {}, bezug: { vertragId: null, dingId: null, firmaId: null }, steckbrief: null, ereignis: null, ereignisDaten: {}, unsicher: [], datenschutz: {} });

describe('Vorschlag übernehmen', () => {
  it('neue Police: Firma + Vertrag + Steckbrief am Dokument; Kündigungsfrist erscheint', async () => {
    const v: Vorschlag = { ...leerV(), dokument: { typ: 'Police', titel: 'Hausrat 2026', datum: '2026-01-10', gueltigVon: '2026-01-01' },
      firma: { name: 'Beispiel Versicherung AG', hotline: '0800 111' },
      vertrag: { kurzname: 'Hausrat', art: 'Versicherung', beitrag: 120, zahlweise: 'jaehrlich', beginn: '2026-01-01', laufzeitende: '2026-12-31', fristWert: 3, fristEinheit: 'Monate', verlaengerung: '12m', fuerWen: 'Familie' },
      steckbrief: { gefahren: ['Feuer', 'Einbruchdiebstahl'], selbstbeteiligung: '150 €' } };
    const { id, u } = await speichern(v);
    expect(u.hinweise[0]).toBe('Neue Firma: Beispiel Versicherung AG');
    const S = await akte();
    const vt = S.vertraege.find((x) => x.kurzname === 'Hausrat')!;
    expect(vt).toMatchObject({ status: 'aktiv', beitrag: 120, firmaId: S.firmen[0].id });
    expect(S.dokumente.find((d) => d.id === id)).toMatchObject({ vertragId: vt.id, firmaId: S.firmen[0].id, steckbrief: { gefahren: ['Feuer', 'Einbruchdiebstahl'] } });
    expect(R.steckbriefAm(vt.id, S.dokumente, '2026-06-01')?.id).toBe(id);
    expect(R.alleFristen(S, T).map((f: { titel: string; datum: string }) => [f.titel, f.datum])).toContainEqual(['Hausrat: kündigen bis (Zugang)', '2027-09-30']); // Frist zum 31.12.2026 am 15.11. verstrichen → nächster Termin
  });

  it('Beitragsmitteilung zu bestehendem Vertrag: Ereignis mit Folgen, Fassung verweist aufs Dokument', async () => {
    const vt = (await akte()).vertraege.find((x) => x.kurzname === 'Hausrat')!;
    const v: Vorschlag = { ...leerV(), dokument: { typ: 'Brief', titel: 'Beitragsanpassung', datum: T }, vertrag: { beitrag: 144, zahlweise: 'jaehrlich' },
      bezug: { vertragId: vt.id, dingId: null, firmaId: null }, ereignis: 'erhoehung', ereignisDaten: { gueltigAb: '2027-01-01', zugang: T } };
    const { id, u } = await speichern(v);
    expect(u.hinweise.some((h) => h.includes('Sonderkündigung'))).toBe(true);
    const S = await akte();
    expect(S.vertraege.find((x) => x.id === vt.id)?.beitrag).toBe(144);
    expect(S.fassungen.find((f) => f.gueltigVon === '2027-01-01')?.dokumentId).toBe(id);
    expect(S.ereignisse.find((e) => e.typ === 'erhoehung')?.dokumentId).toBe(id);
  });

  it('fehlt „gültig ab“: kein Ereignis, nur Hinweis; Dokument wird trotzdem verknüpft', async () => {
    const vt = (await akte()).vertraege.find((x) => x.kurzname === 'Hausrat')!;
    const v: Vorschlag = { ...leerV(), dokument: { typ: 'Nachtrag', titel: 'Nachtrag' }, vertrag: { beitrag: 150 }, bezug: { vertragId: vt.id, dingId: null, firmaId: null }, ereignis: 'nachtrag' };
    const { id, u } = await speichern(v);
    expect(u.ops).toEqual([]);
    expect(u.hinweise[0]).toMatch(/fehlen Angaben/);
    expect((await akte()).dokumente.find((d) => d.id === id)?.vertragId).toBe(vt.id);
  });

  it('Rechnung: Beleg mit Arbeitskosten für § 35a; nichts wird ohne Auswahl angelegt', async () => {
    const v: Vorschlag = { ...leerV(), dokument: { typ: 'Rechnung', titel: 'Heizungswartung', datum: '2026-05-10' }, firma: { name: 'Heizung Muster GmbH' },
      beleg: { betrag: 320, arbeitskosten: 210, steuer: 'handwerker', unbar: true, gewArt: 'wartung' } };
    await speichern(v, { firma: null, belegAnlegen: false });
    expect((await akte()).belege.length).toBe(0);
    await speichern(v);
    const S = await akte();
    expect(S.belege[0]).toMatchObject({ titel: 'Heizungswartung', datum: '2026-05-10', arbeitskosten: 210, steuer: 'handwerker' });
    expect(R.steuer35a(S.belege, 2026).handwerker.ermaessigung).toBe(42);
  });
});

// Schadenfall: Speichern in einer Transaktion, Verlauf, Termine mit Bezug, Fotos nur für Mitglieder. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string, hausB: string, vertrag: string, ding: string;
const SPEICHERN = 'select public.schaden_speichern($1, $2::jsonb, $3::uuid[], $4::jsonb) as id';
const fall = (extra: Record<string, unknown> = {}) => JSON.stringify({ datum: '2026-11-10', titel: 'Wasserschaden Keller', beschreibung: 'Leitung im Keller geplatzt, [Vater] hat Wasser abgestellt.', ...extra });

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
  vertrag = (await db.query("insert into public.vertraege (haushalt_id, kurzname, art) values ($1, 'Hausrat', 'Versicherung') returning id", [haus])).rows[0].id;
  ding = (await db.query("insert into public.dinge (haushalt_id, name, kategorie) values ($1, 'Waschmaschine', 'Gerät') returning id", [haus])).rows[0].id;
});
afterAll(async () => { await db?.end(); });

describe('schaden_speichern', () => {
  it('Fall, Dinge, Prüfung und Verlauf gemeinsam', async () => {
    const pruef = JSON.stringify([{ vertrag_id: vertrag, greift: 'ja', begruendung: 'Leitungswasser versichert', fundstellen: [{ seite: 2, klausel: '§ 3' }], pflichten: ['unverzüglich melden'] }]);
    await als(db, max, async (q) => {
      const id = (await q(SPEICHERN, [haus, fall(), [ding], pruef])).rows[0].id;
      expect((await q('select status from public.schadenfaelle where id = $1', [id])).rows[0].status).toBe('offen');
      expect((await q('select count(*)::int as n from public.schaden_dinge where schaden_id = $1', [id])).rows[0].n).toBe(1);
      expect((await q('select greift from public.schaden_pruefungen where schaden_id = $1', [id])).rows[0].greift).toBe('ja');
      const ev = await q('select text, vertrag_id, ding_id from public.ereignisse where schaden_id = $1 order by text', [id]);
      expect(ev.rows.map((r) => r.text)).toEqual(['Schadenfall angelegt', 'Schadenfall geprüft: greift ja (Wasserschaden Keller)', 'Schadenfall: Wasserschaden Keller']);
      // Termin aus einer Pflicht mit Bezug zum Fall
      await q("insert into public.termine (haushalt_id, titel, datum, schaden_id) values ($1, 'Schaden melden', '2026-11-12', $2)", [haus, id]);
      expect((await q('select count(*)::int as n from public.termine where schaden_id = $1', [id])).rows[0].n).toBe(1);
    });
  });

  it('alles oder nichts: ungültige Prüfung → kein Fall', async () => {
    await als(db, max, async (q) => {
      await expect(q(SPEICHERN, [haus, fall({ titel: 'Kaputt' }), [], JSON.stringify([{ vertrag_id: vertrag, greift: 'vielleicht' }])])).rejects.toMatchObject({ code: '23514' });
      expect((await q("select count(*)::int as n from public.schadenfaelle where titel = 'Kaputt'")).rows[0].n).toBe(0);
    });
  });

  it('fremder Nutzer: kann nicht in Haushalt A anlegen und keinen fremden Vertrag/Ding verknüpfen', async () => {
    await als(db, fremd, async (q) => {
      expect(await verweigert(q(SPEICHERN, [haus, fall(), [], '[]']))).toBe(true);
      // eigener Haushalt, aber Ding aus Haushalt A → Fremdschlüssel greift
      await expect(q(SPEICHERN, [hausB, fall(), [ding], '[]'])).rejects.toMatchObject({ code: '23503' });
    });
  });
});

describe('Schaden-Tabellen RLS', () => {
  let id: string;
  beforeAll(async () => {
    id = (await db.query("insert into public.schadenfaelle (haushalt_id, datum, titel, beschreibung) values ($1, '2026-11-01', 'Sturm', 'Ziegel vom Dach gefallen.') returning id", [haus])).rows[0].id;
    await db.query("insert into public.schaden_pruefungen (haushalt_id, schaden_id, vertrag_id, greift) values ($1, $2, $3, 'unklar')", [haus, id, vertrag]);
  });

  it('fremder Nutzer liest und ändert nichts', async () => {
    await als(db, fremd, async (q) => {
      for (const t of ['schadenfaelle', 'schaden_dinge', 'schaden_pruefungen', 'schaden_fotos']) expect((await q(`select * from public.${t}`)).rowCount).toBe(0);
      expect((await q("update public.schadenfaelle set status = 'erledigt'")).rowCount).toBe(0);
      expect((await q('delete from public.schaden_pruefungen')).rowCount).toBe(0);
    });
  });

  it('Status über schaden_status: mit Verlauf; fremder Nutzer scheitert', async () => {
    await als(db, max, async (q) => {
      await q("select public.schaden_status($1, $2, 'gemeldet', 'per Hotline')", [haus, id]);
      expect((await q("select text from public.ereignisse where schaden_id = $1 and text like 'Status%'", [id])).rows[0].text).toBe('Status: gemeldet – per Hotline');
      await expect(q("select public.schaden_status($1, $2, 'egal')", [haus, id])).rejects.toMatchObject({ code: '23514' });
    });
    await als(db, fremd, async (q) => {
      await expect(q("select public.schaden_status($1, $2, 'erledigt')", [haus, id])).rejects.toMatchObject({ code: 'P0002' });
    });
  });

  it('Mitglied ändert Status; Foto-Pfad muss zum Fall passen', async () => {
    await als(db, max, async (q) => {
      expect((await q("update public.schadenfaelle set status = 'gemeldet' where id = $1", [id])).rowCount).toBe(1);
      const f = randomUUID();
      await q('insert into public.schaden_fotos (id, haushalt_id, schaden_id, pfad) values ($1, $2, $3, $4)', [f, haus, id, `${haus}/${id}/${f}.jpg`]);
      await expect(q('insert into public.schaden_fotos (haushalt_id, schaden_id, pfad) values ($1, $2, $3)', [haus, id, `${hausB}/${id}/x.jpg`])).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('Storage: nur Mitglieder legen Fotos im eigenen Haushalt ab und lesen sie', async () => {
    const pfad = `${haus}/${id}/${randomUUID()}.jpg`;
    await als(db, max, async (q) => {
      await q("insert into storage.objects (bucket_id, name) values ('schadenfotos', $1)", [pfad]);
      expect(await verweigert(q("insert into storage.objects (bucket_id, name) values ('schadenfotos', $1)", [`${haus}/${id}/../x.jpg`]))).toBe(true);
    });
    await db.query("insert into storage.objects (bucket_id, name) values ('schadenfotos', $1)", [pfad]);
    await als(db, fremd, async (q) => {
      expect((await q('select 1 from storage.objects where name = $1', [pfad])).rowCount).toBe(0);
      expect((await q('delete from storage.objects where name = $1', [pfad])).rowCount).toBe(0);
      expect(await verweigert(q("insert into storage.objects (bucket_id, name) values ('schadenfotos', $1)", [`${haus}/${id}/${randomUUID()}.jpg`]))).toBe(true);
    });
  });

  it('anonym: kein Zugriff', async () => {
    await als(db, 'anon', async (q) => { expect(await verweigert(q('select * from public.schadenfaelle'))).toBe(true); });
  });
});

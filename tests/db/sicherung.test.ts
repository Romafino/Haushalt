// Sicherung zurückspielen: alles oder nichts, ersetzt nur den eigenen Haushalt, fremde Nutzer scheitern. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string, hausB: string;
const EIN = 'select public.sicherung_einspielen($1, $2::jsonb) as stand';
const TABELLEN = ['firmen', 'dinge', 'vertraege', 'vertrag_dinge', 'vertrag_rollen', 'dokumente', 'fassungen', 'belege', 'schadenfaelle', 'termine', 'ereignisse',
  'dokument_seiten', 'dokument_bilder', 'schaden_dinge', 'schaden_pruefungen', 'schaden_fotos', 'fragen', 'schwaerzliste'];

/** So wie die App sichert: alle Zeilen je Tabelle als JSON. */
async function sichern(h: string) {
  const d: Record<string, unknown[]> = {};
  for (const t of TABELLEN) d[t] = (await db.query(`select to_jsonb(x) as z from public.${t} x where haushalt_id = $1`, [h])).rows.map((r) => r.z);
  return d;
}
const zaehlen = async (h: string) => Object.fromEntries(await Promise.all(TABELLEN.map(async (t) => [t, (await db.query(`select count(*)::int as n from public.${t} where haushalt_id = $1`, [h])).rows[0].n])));

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
  const f = (await db.query("insert into public.firmen (haushalt_id, name, hotline) values ($1, 'Beispiel Versicherung AG', '0800 111 2222') returning id", [haus])).rows[0].id;
  const v1 = (await db.query("insert into public.vertraege (haushalt_id, kurzname, art, firma_id) values ($1, 'Hausrat neu', 'Versicherung', $2) returning id", [haus, f])).rows[0].id;
  await db.query("insert into public.vertraege (haushalt_id, kurzname, art, ersetzt_durch_id) values ($1, 'Hausrat alt', 'Versicherung', $2)", [haus, v1]);
  const d = randomUUID();
  await db.query("insert into public.dokumente (id, haushalt_id, typ, titel, vertrag_id, seiten) values ($1, $2, 'Police', 'Hausrat 2026', $3, 1)", [d, haus, v1]);
  await db.query("insert into public.dokument_seiten (haushalt_id, dokument_id, nr, text) values ($1, $2, 1, 'Feuer, Leitungswasser')", [haus, d]);
  await db.query("insert into public.dokument_bilder (haushalt_id, dokument_id, nr, pfad) values ($1, $2, 1, $3)", [haus, d, `${haus}/${d}/1.jpg`]);
  await db.query("insert into public.termine (haushalt_id, schluessel, abgeleitet, erledigt_fuer) values ($1, $2, true, '2026-01-01')", [haus, 'kb_' + v1]);
  await db.query("insert into public.fragen (haushalt_id, frage, antwort, stichtag, erstellt_von) values ($1, 'Ist [Vater] versichert?', 'Ja.', '2026-11-16', $2)", [haus, max.id]);
  await db.query("insert into public.schwaerzliste (haushalt_id, salz, iter, iv, daten) values ($1, $2, 310000, $3, $4)", [haus, 'A'.repeat(22) + '==', 'B'.repeat(16), 'C'.repeat(40)]);
});
afterAll(async () => { await db?.end(); });

describe('sicherung_einspielen', () => {
  it('Sicherung → Daten ändern → zurückspielen: Stand wie gesichert, Suche funktioniert', async () => {
    const vorher = await zaehlen(haus), sicherung = await sichern(haus);
    await als(db, max, async (q) => {
      await q("insert into public.dinge (haushalt_id, name, kategorie) values ($1, 'Nachträglich', 'Haus')", [haus]);
      await q("update public.firmen set name = 'Geändert' where haushalt_id = $1", [haus]);
      const stand = (await q(EIN, [haus, JSON.stringify({ ...sicherung, einstellungen: { vorlaufTage: 30 } })])).rows[0].stand;
      expect(stand.vertraege).toBe(2);
      for (const t of TABELLEN) expect((await q(`select count(*)::int as n from public.${t} where haushalt_id = $1`, [haus])).rows[0].n, t).toBe(vorher[t]);
      expect((await q('select name from public.firmen where haushalt_id = $1', [haus])).rows[0].name).toBe('Beispiel Versicherung AG');
      expect((await q("select count(*)::int as n from public.dokument_seiten where haushalt_id = $1 and suche @@ plainto_tsquery('german', 'Leitungswasser')", [haus])).rows[0].n).toBe(1);
      expect((await q('select erstellt_von from public.fragen where haushalt_id = $1', [haus])).rows[0].erstellt_von).toBeNull();
      expect((await q('select einstellungen from public.haushalte where id = $1', [haus])).rows[0].einstellungen).toEqual({ vorlaufTage: 30 });
    });
  });

  it('alles oder nichts: fehlerhafte Zeile → nichts gelöscht', async () => {
    const vorher = await zaehlen(haus), sicherung = await sichern(haus);
    await als(db, max, async (q) => {
      const kaputt = { ...sicherung, belege: [{ id: randomUUID(), titel: 'x', steuer: 'gibtsnicht' }] };
      await expect(q(EIN, [haus, JSON.stringify(kaputt)])).rejects.toBeTruthy();
      for (const t of TABELLEN) expect((await q(`select count(*)::int as n from public.${t} where haushalt_id = $1`, [haus])).rows[0].n, t).toBe(vorher[t]);
    });
  });

  it('Sicherung aus Haushalt A in Haushalt B: haushalt_id wird B, A bleibt unberührt (IDs kollidieren → abgelehnt)', async () => {
    const sicherung = await sichern(haus), vorher = await zaehlen(haus);
    await als(db, fremd, async (q) => {
      await expect(q(EIN, [hausB, JSON.stringify(sicherung)])).rejects.toMatchObject({ code: '23505' });
    });
    expect(await zaehlen(haus)).toEqual(vorher);
  });

  it('fremder Nutzer kann Haushalt A nicht ersetzen oder leeren', async () => {
    const vorher = await zaehlen(haus);
    await als(db, fremd, async (q) => {
      await expect(q(EIN, [haus, '{}'])).rejects.toMatchObject({ code: '42501' });
    });
    expect(await zaehlen(haus)).toEqual(vorher);
  });
});

// Dokumente: Speichern in einer Transaktion, Storage nur für Mitglieder, KI-Protokoll ohne Änderung. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string, hausB: string, vertrag: string;
const SPEICHERN = 'select public.dokument_speichern($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb) as id';

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
  vertrag = (await db.query("insert into public.vertraege (haushalt_id, kurzname, art, beitrag, zahlweise) values ($1, 'Hausrat', 'Versicherung', 120, 'jaehrlich') returning id", [haus])).rows[0].id;
});
afterAll(async () => { await db?.end(); });

const dok = (id: string, extra: Record<string, unknown> = {}) => JSON.stringify({ id, typ: 'Police', titel: 'Hausrat 2026', datum: '2026-01-15', vertrag_id: vertrag, seiten: 2, quelle: 'pdf', steckbrief: { gefahren: ['Feuer'] }, ...extra });
const seiten = JSON.stringify([{ nr: 1, text: 'Versicherungsschein für [Vater], [Adresse]' }, { nr: 2, text: 'Feuer, Leitungswasser, Einbruchdiebstahl' }]);
const bilder = (h: string, d: string) => JSON.stringify([{ nr: 1, pfad: `${h}/${d}/1.jpg` }, { nr: 2, pfad: `${h}/${d}/2.jpg` }]);

describe('dokument_speichern', () => {
  it('Dokument, Seiten, Bilder und Folgen (Fassung) gemeinsam; Volltextsuche findet deutsche Wortformen', async () => {
    const d = randomUUID();
    const ops = JSON.stringify([{ art: 'neu', tabelle: 'fassungen', daten: { vertrag_id: vertrag, gueltig_von: '2026-01-01', beitrag: 130, grund: 'Nachtrag', dokument_id: d } }]);
    await als(db, max, async (q) => {
      expect((await q(SPEICHERN, [haus, dok(d), seiten, bilder(haus, d), ops])).rows[0].id).toBe(d);
      expect((await q('select count(*)::int as n from public.dokument_seiten where dokument_id = $1', [d])).rows[0].n).toBe(2);
      expect((await q('select count(*)::int as n from public.dokument_bilder where dokument_id = $1', [d])).rows[0].n).toBe(2);
      expect((await q('select dokument_id from public.fassungen where vertrag_id = $1', [vertrag])).rows[0].dokument_id).toBe(d);
      const treffer = await q("select nr from public.dokument_seiten where haushalt_id = $1 and suche @@ plainto_tsquery('german', 'Leitungswassers Feuer')", [haus]);
      expect(treffer.rows.map((r) => r.nr)).toEqual([2]);
      // Grenze der deutschen Volltextsuche: Komposita werden nicht zerlegt („Einbruch“ findet „Einbruchdiebstahl“ nicht) → Schritt 8
      const kompositum = await q("select nr from public.dokument_seiten where haushalt_id = $1 and suche @@ plainto_tsquery('german', 'Einbruch')", [haus]);
      expect(kompositum.rowCount).toBe(0);
    });
  });

  it('alles oder nichts: falscher Bildpfad → kein Dokument, keine Seiten', async () => {
    const d = randomUUID();
    await als(db, max, async (q) => {
      await expect(q(SPEICHERN, [haus, dok(d), seiten, JSON.stringify([{ nr: 1, pfad: `${hausB}/${d}/1.jpg` }]), '[]'])).rejects.toMatchObject({ code: '23514' });
      expect((await q('select count(*)::int as n from public.dokumente where id = $1', [d])).rows[0].n).toBe(0);
      expect((await q('select count(*)::int as n from public.dokument_seiten where dokument_id = $1', [d])).rows[0].n).toBe(0);
    });
  });

  it('lehnt unbekannte Felder und fehlende ID ab; fremder Nutzer kann nicht in A speichern', async () => {
    await als(db, max, async (q) => {
      await expect(q(SPEICHERN, [haus, dok(randomUUID(), { haushalt_id: hausB }), '[]', '[]', '[]'])).rejects.toMatchObject({ code: '22023' });
      await expect(q(SPEICHERN, [haus, JSON.stringify({ typ: 'Brief' }), '[]', '[]', '[]'])).rejects.toMatchObject({ code: '22023' });
    });
    await als(db, fremd, async (q) => {
      expect(await verweigert(q(SPEICHERN, [haus, dok(randomUUID(), { vertrag_id: null }), '[]', '[]', '[]']))).toBe(true);
    });
  });

  it('Dokument löschen nimmt Seiten und Bild-Einträge mit; Fassung behält den Vertrag, verliert nur das Dokument', async () => {
    const d = randomUUID();
    const ops = JSON.stringify([{ art: 'neu', tabelle: 'fassungen', daten: { vertrag_id: vertrag, gueltig_von: '2026-06-01', dokument_id: d } }]);
    await als(db, max, async (q) => {
      await q(SPEICHERN, [haus, dok(d), seiten, bilder(haus, d), ops]);
      await q('delete from public.dokumente where id = $1', [d]);
      expect((await q('select count(*)::int as n from public.dokument_seiten where dokument_id = $1', [d])).rows[0].n).toBe(0);
      expect((await q('select count(*)::int as n from public.dokument_bilder where dokument_id = $1', [d])).rows[0].n).toBe(0);
      expect((await q("select dokument_id from public.fassungen where gueltig_von = '2026-06-01'")).rows[0].dokument_id).toBeNull();
    });
  });
});

describe('Storage-Bucket dokumente', () => {
  const ablegen = (q: (s: string, w?: unknown[]) => Promise<pg.QueryResult>, name: string) =>
    q("insert into storage.objects (bucket_id, name) values ('dokumente', $1)", [name]);

  it('Mitglied legt Bilder unter dem eigenen Haushalt ab und liest sie; fremder Nutzer sieht und löscht nichts', async () => {
    const pfad = `${haus}/${randomUUID()}/1.jpg`;
    await db.query("insert into storage.objects (bucket_id, name) values ('dokumente', $1)", [pfad]);
    await als(db, max, async (q) => {
      await ablegen(q, `${haus}/${randomUUID()}/2.jpg`);
      expect((await q('select 1 from storage.objects where name = $1', [pfad])).rowCount).toBe(1);
    });
    await als(db, fremd, async (q) => {
      expect((await q('select 1 from storage.objects where name = $1', [pfad])).rowCount).toBe(0);
      expect((await q('delete from storage.objects where name = $1', [pfad])).rowCount).toBe(0);
      expect(await verweigert(ablegen(q, `${haus}/${randomUUID()}/1.jpg`))).toBe(true);
    });
    await als(db, 'anon', async (q) => {
      expect((await q('select 1 from storage.objects where name = $1', [pfad])).rowCount).toBe(0);
    });
  });

  it.each(['irgendwo/datei.jpg', 'HAUS/x/1.png', 'HAUS/../1.jpg', 'HAUS/DOK/1.pdf'])('lehnt Pfad ab: %s', async (muster) => {
    const name = muster.replace('HAUS', haus).replace('DOK', randomUUID());
    await als(db, max, async (q) => {
      expect(await verweigert(ablegen(q, name))).toBe(true);
    });
  });
});

describe('ki_protokoll', () => {
  it('Mitglied legt Einträge an und liest sie; ändern und löschen geht nicht; fremder Nutzer liest nichts', async () => {
    await als(db, max, async (q) => {
      await q("insert into public.ki_protokoll (haushalt_id, aufgabe, anbieter, modell, seiten, eingabe_tokens, ausgabe_tokens, kosten_cent) values ($1, 'dokument', 'gemini', 'test', 2, 1000, 200, 0.5)", [haus]);
      expect((await q('select count(*)::int as n from public.ki_protokoll')).rows[0].n).toBe(1);
      expect(await verweigert(q('update public.ki_protokoll set kosten_cent = 0'))).toBe(true);
      expect(await verweigert(q('delete from public.ki_protokoll'))).toBe(true);
      expect(await verweigert(q("insert into public.ki_protokoll (haushalt_id, aufgabe, anbieter, nutzer_id) values ($1, 'dokument', 'x', $2)", [haus, fremd.id]))).toBe(true);
    });
    await als(db, fremd, async (q) => {
      expect((await q('select count(*)::int as n from public.ki_protokoll where haushalt_id = $1', [haus])).rows[0].n).toBe(0);
    });
  });

  it('hat keine Spalte für Inhalte', async () => {
    const r = await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ki_protokoll' order by 1");
    expect(r.rows.map((x) => x.column_name)).toEqual(['anbieter', 'aufgabe', 'ausgabe_tokens', 'eingabe_tokens', 'erfolg', 'haushalt_id', 'id', 'kosten_cent', 'modell', 'nutzer_id', 'seiten', 'zeitpunkt']);
  });
});

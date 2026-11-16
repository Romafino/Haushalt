// Trigramm-Suche (Wortteile, Tippfehler) und Dublettenerkennung; nur eigener Haushalt. Erfundene Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { als, datenbankAufbauen, nutzerAnlegen, type Nutzer } from './hilfe';

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let haus: string, d1: string;
const SUCHE = 'select dokument_id, nr from public.seiten_suchen($1, $2)';
const DUB = 'select * from public.dokument_dubletten($1, $2)';
const TEXT = 'Versicherungsschein Hausratversicherung. Versicherte Gefahren: Feuer, Leitungswasser, Einbruchdiebstahl, Sturm. Selbstbeteiligung 150 Euro je Schadenfall.';

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, 'max@beispiel.invalid');
  fremd = await nutzerAnlegen(db, 'fremd@beispiel.invalid');
  haus = (await db.query("insert into public.haushalte (name) values ('A') returning id")).rows[0].id;
  const hausB = (await db.query("insert into public.haushalte (name) values ('B') returning id")).rows[0].id;
  await db.query('insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2), ($3, $4)', [haus, max.id, hausB, fremd.id]);
  d1 = randomUUID();
  await db.query("insert into public.dokumente (id, haushalt_id, typ, titel, datum, seiten) values ($1, $2, 'Police', 'Hausrat 2026', '2026-01-10', 1)", [d1, haus]);
  await db.query('insert into public.dokument_seiten (haushalt_id, dokument_id, nr, text) values ($1, $2, 1, $3)', [haus, d1, TEXT]);
});
afterAll(async () => { await db?.end(); });

describe('Trigramm-Suche', () => {
  it('findet Wortteile am Ende und Tippfehler, Volltext-Treffer weiter zuerst', async () => {
    await als(db, max, async (q) => {
      expect((await q(SUCHE, [haus, 'Ist Diebstahl versichert?'])).rows.map((r) => r.nr)).toEqual([1]);
      expect((await q(SUCHE, [haus, 'Einbnuchdiebstahl'])).rows.map((r) => r.nr)).toEqual([1]);
      expect((await q(SUCHE, [haus, 'Wie hoch ist die Selbstbeteiligung'])).rowCount).toBe(1);
      expect((await q(SUCHE, [haus, 'Erdbebenschaden Vulkan'])).rowCount).toBe(0);
    });
  });
});

describe('Dubletten', () => {
  it('gleicher Text (andere Groß-/Kleinschreibung, Leerraum) → gleich; ähnlicher Text → Ähnlichkeit; anderer Text → nichts', async () => {
    await als(db, max, async (q) => {
      const g = (await q(DUB, [haus, TEXT.toUpperCase().replace(/ /g, '  \n')])).rows;
      expect(g).toHaveLength(1);
      expect(g[0]).toMatchObject({ dokument_id: d1, gleich: true, titel: 'Hausrat 2026' });
      const a = (await q(DUB, [haus, TEXT.replace('Sturm', 'Sturn').replace('150', '15O')])).rows;
      expect(a[0]).toMatchObject({ dokument_id: d1, gleich: false });
      expect(a[0].aehnlichkeit).toBeGreaterThan(0.8);
      expect((await q(DUB, [haus, 'Rechnung Malerarbeiten Wohnzimmer, Arbeitskosten 800 Euro, Material 200 Euro'])).rowCount).toBe(0);
      expect((await q(DUB, [haus, 'kurz'])).rowCount).toBe(0);
    });
  });
  it('fremder Nutzer bekommt keine Treffer aus Haushalt A', async () => {
    await als(db, fremd, async (q) => {
      expect((await q(DUB, [haus, TEXT])).rowCount).toBe(0);
      expect((await q(SUCHE, [haus, 'Diebstahl'])).rowCount).toBe(0);
    });
  });
});

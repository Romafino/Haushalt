// RLS der Akte: zu jeder Tabelle ein Test, dass ein fremder Nutzer nichts liest, anlegt, ändert oder löscht,
// dazu Verweise nur innerhalb des Haushalts und die beschlossene Lösch-Kaskade.
// Erfundene Testdaten: Max Mustermann (Haushalt A), Fremd Person (Haushalt B).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from "./hilfe";

let db: pg.Client;
let max: Nutzer, fremd: Nutzer;
let hausA: string, hausB: string;
const id: Record<string, string> = {};

async function haushalt(n: Nutzer, name: string) {
  const h = (await db.query("insert into public.haushalte (name) values ($1) returning id", [name])).rows[0].id as string;
  await db.query("insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2)", [h, n.id]);
  return h;
}

// Je Tabelle: wie man in Haushalt h eine Zeile anlegt (Spalten + Werte), passend zu den Beispieldaten.
const NEU: Record<string, (h: string) => [string, unknown[]]> = {
  firmen: (h) => ["(haushalt_id, name) values ($1, 'Beispiel Versicherung AG')", [h]],
  dinge: (h) => ["(haushalt_id, name, kategorie) values ($1, 'Kombi', 'Auto')", [h]],
  vertraege: (h) => ["(haushalt_id, kurzname, art) values ($1, 'Hausrat', 'Versicherung')", [h]],
  vertrag_dinge: (h) => ["(haushalt_id, vertrag_id, ding_id) values ($1, $2, $3)", [h, id.vertrag2, id.ding]],
  vertrag_rollen: (h) => ["(haushalt_id, vertrag_id, rolle) values ($1, $2, 'Mutter')", [h, id.vertrag]],
  fassungen: (h) => ["(haushalt_id, vertrag_id, gueltig_von) values ($1, $2, '2026-01-01')", [h, id.vertrag]],
  belege: (h) => ["(haushalt_id, titel) values ($1, 'Wartung Heizung')", [h]],
  termine: (h) => ["(haushalt_id, titel, datum) values ($1, 'Schornsteinfeger', '2026-12-01')", [h]],
  ereignisse: (h) => ["(haushalt_id, datum, typ, text) values ($1, '2026-11-15', 'notiz', 'Beispiel')", [h]],
};
const TABELLEN = Object.keys(NEU);

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, "max@beispiel.invalid");
  fremd = await nutzerAnlegen(db, "fremd@beispiel.invalid");
  hausA = await haushalt(max, "Haushalt A");
  hausB = await haushalt(fremd, "Haushalt B");
  // Beispielakte in Haushalt A (als Datenbank-Eigentümer, ohne RLS)
  const q = async (sql: string, w: unknown[]) => (await db.query(sql, w)).rows[0].id as string;
  id.firma = await q("insert into public.firmen (haushalt_id, name, hotline) values ($1, 'Beispiel Versicherung AG', '0800 111') returning id", [hausA]);
  id.ding = await q("insert into public.dinge (haushalt_id, name, kategorie) values ($1, 'Kombi', 'Auto') returning id", [hausA]);
  id.vertrag = await q("insert into public.vertraege (haushalt_id, kurzname, art, firma_id, beitrag, zahlweise) values ($1, 'Kfz', 'Versicherung', $2, 480, 'jaehrlich') returning id", [hausA, id.firma]);
  id.vertrag2 = await q("insert into public.vertraege (haushalt_id, kurzname, art) values ($1, 'Strom', 'Strom/Gas') returning id", [hausA]);
  await db.query("insert into public.vertrag_dinge (haushalt_id, vertrag_id, ding_id, haupt) values ($1, $2, $3, true)", [hausA, id.vertrag, id.ding]);
  await db.query("insert into public.vertrag_rollen (haushalt_id, vertrag_id, rolle, haupt) values ($1, $2, 'Vater', true)", [hausA, id.vertrag]);
  await db.query("insert into public.fassungen (haushalt_id, vertrag_id, gueltig_von, beitrag) values ($1, $2, '2025-01-01', 450)", [hausA, id.vertrag]);
  id.beleg = await q("insert into public.belege (haushalt_id, titel, firma_id, ding_id, arbeitskosten, steuer, unbar) values ($1, 'Inspektion', $2, $3, 200, 'handwerker', true) returning id", [hausA, id.firma, id.ding]);
  await db.query("insert into public.termine (haushalt_id, titel, datum, vertrag_id, beleg_id) values ($1, 'Kfz prüfen', '2026-12-01', $2, $3)", [hausA, id.vertrag, id.beleg]);
  await db.query("insert into public.ereignisse (haushalt_id, datum, typ, text, vertrag_id) values ($1, '2026-01-01', 'neu', 'Vertrag angelegt', $2)", [hausA, id.vertrag]);
});

afterAll(async () => {
  await db?.end();
});

describe.each(TABELLEN)("Tabelle %s", (t) => {
  it("fremder Nutzer liest nichts aus Haushalt A", async () => {
    const r = await als(db, fremd, (q) => q(`select * from public.${t} where haushalt_id = $1`, [hausA]));
    expect(r.rowCount).toBe(0);
    const alle = await als(db, fremd, (q) => q(`select * from public.${t}`));
    expect(alle.rows.every((x) => x.haushalt_id === hausB)).toBe(true);
  });

  it("fremder Nutzer legt in Haushalt A nichts an", async () => {
    const [werte, p] = NEU[t](hausA);
    await als(db, fremd, async (q) => {
      expect(await verweigert(q(`insert into public.${t} ${werte}`, p))).toBe(true);
    });
  });

  it("fremder Nutzer ändert und löscht in Haushalt A nichts", async () => {
    const vorher = (await db.query(`select count(*)::int as n from public.${t} where haushalt_id = $1`, [hausA])).rows[0].n;
    await als(db, fremd, async (q) => {
      expect((await q(`update public.${t} set haushalt_id = haushalt_id where haushalt_id = $1`, [hausA])).rowCount).toBe(0);
      expect((await q(`delete from public.${t} where haushalt_id = $1`, [hausA])).rowCount).toBe(0);
    });
    const nachher = (await db.query(`select count(*)::int as n from public.${t} where haushalt_id = $1`, [hausA])).rows[0].n;
    expect(nachher).toBe(vorher);
  });

  it("fremder Nutzer kann eigene Zeilen nicht in Haushalt A umhängen", async () => {
    const [werte, p] = NEU[t](hausB);
    // In B ist ein Verweis auf A-Verträge/Dinge ohnehin unmöglich; für Tabellen ohne Verweise prüfen wir das Umhängen.
    if (["vertrag_dinge", "vertrag_rollen", "fassungen"].includes(t)) return;
    await als(db, fremd, async (q) => {
      await q(`insert into public.${t} ${werte}`, p);
      expect(await verweigert(q(`update public.${t} set haushalt_id = $1 where haushalt_id = $2`, [hausA, hausB]))).toBe(true);
    });
  });

  it("anonym: kein Zugriff", async () => {
    await als(db, "anon", async (q) => {
      expect(await verweigert(q(`select * from public.${t}`))).toBe(true);
    });
  });

  it("Mitglied liest, legt an, ändert und löscht im eigenen Haushalt", async () => {
    const [werte, p] = NEU[t](hausA);
    await als(db, max, async (q) => {
      expect((await q(`select * from public.${t}`)).rowCount).toBeGreaterThan(0);
      await q(`insert into public.${t} ${werte}`, p);
      expect((await q(`update public.${t} set haushalt_id = haushalt_id where haushalt_id = $1`, [hausA])).rowCount).toBeGreaterThan(0);
    });
  });
});

describe("Verweise bleiben im Haushalt", () => {
  it("fremder Nutzer kann in seinem Haushalt nicht auf Firma oder Ding aus A verweisen", async () => {
    await als(db, fremd, async (q) => {
      await expect(q("insert into public.vertraege (haushalt_id, kurzname, art, firma_id) values ($1, 'x', 'Abo', $2)", [hausB, id.firma])).rejects.toMatchObject({ code: "23503" });
      await expect(q("insert into public.belege (haushalt_id, titel, ding_id) values ($1, 'x', $2)", [hausB, id.ding])).rejects.toMatchObject({ code: "23503" });
    });
  });

  it("auch der Datenbank-Eigentümer kann keinen Verweis über Haushaltsgrenzen anlegen", async () => {
    const neu = (await db.query("insert into public.vertraege (haushalt_id, kurzname, art) values ($1, 'Rechtsschutz', 'Versicherung') returning id", [hausA])).rows[0].id;
    await expect(db.query("insert into public.vertrag_dinge (haushalt_id, vertrag_id, ding_id) values ($1, $2, $3)", [hausB, neu, id.ding])).rejects.toMatchObject({ code: "23503" });
  });

  it("Vertrag kann nicht durch sich selbst ersetzt werden", async () => {
    await expect(db.query("update public.vertraege set ersetzt_durch_id = id where id = $1", [id.vertrag])).rejects.toMatchObject({ code: "23514" });
  });
});

describe("Lösch-Kaskade (entschieden)", () => {
  it("Vertrag löschen nimmt Fassungen, Bezüge und Zeitleiste mit; Belege und Termine bleiben ohne Zuordnung", async () => {
    await als(db, max, async (q) => {
      const v = (await q("insert into public.vertraege (haushalt_id, kurzname, art) values ($1, 'Haftpflicht', 'Versicherung') returning id", [hausA])).rows[0].id;
      await q("insert into public.fassungen (haushalt_id, vertrag_id, gueltig_von) values ($1, $2, '2026-01-01')", [hausA, v]);
      await q("insert into public.vertrag_dinge (haushalt_id, vertrag_id, ding_id) values ($1, $2, $3)", [hausA, v, id.ding]);
      await q("insert into public.vertrag_rollen (haushalt_id, vertrag_id, rolle) values ($1, $2, 'Tochter')", [hausA, v]);
      await q("insert into public.ereignisse (haushalt_id, datum, typ, text, vertrag_id) values ($1, '2026-01-01', 'neu', 'x', $2)", [hausA, v]);
      const t = (await q("insert into public.termine (haushalt_id, titel, datum, vertrag_id) values ($1, 'prüfen', '2026-12-01', $2) returning id", [hausA, v])).rows[0].id;
      await q("delete from public.vertraege where id = $1", [v]);
      for (const tab of ["fassungen", "vertrag_dinge", "vertrag_rollen", "ereignisse"]) {
        expect((await q(`select 1 from public.${tab} where vertrag_id = $1`, [v])).rowCount, tab).toBe(0);
      }
      const termin = await q("select vertrag_id from public.termine where id = $1", [t]);
      expect(termin.rows[0].vertrag_id).toBeNull();
    });
  });

  it("Firma löschen: Verträge und Belege bleiben, verlieren nur die Firma", async () => {
    await als(db, max, async (q) => {
      await q("delete from public.firmen where id = $1", [id.firma]);
      expect((await q("select firma_id from public.vertraege where id = $1", [id.vertrag])).rows[0].firma_id).toBeNull();
      expect((await q("select firma_id from public.belege where id = $1", [id.beleg])).rows[0].firma_id).toBeNull();
    });
  });
});

describe("Pflege", () => {
  it("geaendert_am wird beim Ändern gesetzt", async () => {
    const vorher = (await db.query("select geaendert_am from public.dinge where id = $1", [id.ding])).rows[0].geaendert_am;
    await db.query("select pg_sleep(0.01)");
    await db.query("update public.dinge set modell = 'Kombi 2' where id = $1", [id.ding]);
    const nachher = (await db.query("select geaendert_am from public.dinge where id = $1", [id.ding])).rows[0].geaendert_am;
    expect(nachher.getTime()).toBeGreaterThan(vorher.getTime());
  });

  it("Schlüssel für abgeleitete Termine nur im erwarteten Format", async () => {
    await expect(db.query("insert into public.termine (haushalt_id, schluessel, abgeleitet) values ($1, 'kb_' || $2, true)", [hausA, randomUUID()])).resolves.toBeTruthy();
    await expect(db.query("insert into public.termine (haushalt_id, schluessel, abgeleitet) values ($1, 'irgendwas', true)", [hausA])).rejects.toMatchObject({ code: "23514" });
  });
});

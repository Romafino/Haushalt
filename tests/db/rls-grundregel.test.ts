// RLS-Grundregel: nur Mitglieder des Haushalts lesen und schreiben.
// Erfundene Testdaten: Max und Erika Mustermann (Haushalt A), Fremd Person (Haushalt B).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { als, datenbankAufbauen, nutzerAnlegen, verweigert, type Nutzer } from "./hilfe";

let db: pg.Client;
let max: Nutzer, erika: Nutzer, fremd: Nutzer;
let hausA: string, hausB: string;

beforeAll(async () => {
  db = await datenbankAufbauen();
  max = await nutzerAnlegen(db, "max@beispiel.invalid");
  erika = await nutzerAnlegen(db, "erika@beispiel.invalid");
  fremd = await nutzerAnlegen(db, "fremd@beispiel.invalid");

  // Haushalte über die echten Funktionen anlegen, dauerhaft (nicht in als()).
  const anlegen = async (n: Nutzer, name: string) => {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: n.id, role: "authenticated" })]);
    const r = await db.query("select public.haushalt_anlegen($1) as id", [name]);
    await db.query("commit");
    return r.rows[0].id as string;
  };
  hausA = await anlegen(max, "Haushalt A");
  hausB = await anlegen(fremd, "Haushalt B");
  await db.query("insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2)", [hausA, erika.id]);
});

afterAll(async () => {
  await db?.end();
});

describe("Aufbau: keine Tabelle ohne RLS", () => {
  it("jede Tabelle im Schema public hat RLS eingeschaltet", async () => {
    const r = await db.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });

  it("jede Tabelle außer haushalte hat eine Spalte haushalt_id (not null)", async () => {
    const r = await db.query(`
      select t.table_name from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and t.table_name <> 'haushalte'
        and not exists (select 1 from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = t.table_name
            and c.column_name = 'haushalt_id' and c.is_nullable = 'NO')`);
    expect(r.rows.map((x) => x.table_name)).toEqual([]);
  });

  it("jede Tabelle hat mindestens eine Regel, und jede Regel prüft die Mitgliedschaft", async () => {
    const ohne = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)`);
    expect(ohne.rows.map((x) => x.relname)).toEqual([]);

    const regeln = await db.query("select tablename, policyname, roles, qual, with_check from pg_policies where schemaname = 'public'");
    for (const p of regeln.rows) {
      const ausdruck = `${p.qual ?? ""} ${p.with_check ?? ""}`;
      expect(ausdruck, `${p.tablename}.${p.policyname}`).toContain("ist_mitglied");
      expect(String(p.roles), `${p.tablename}.${p.policyname}`).not.toContain("anon");
      expect(String(p.roles), `${p.tablename}.${p.policyname}`).not.toContain("public");
    }
  });
});

describe("haushalte", () => {
  it("Mitglied sieht nur den eigenen Haushalt", async () => {
    const r = await als(db, max, (q) => q("select id from public.haushalte"));
    expect(r.rows.map((x) => x.id)).toEqual([hausA]);
    const r2 = await als(db, erika, (q) => q("select id from public.haushalte"));
    expect(r2.rows.map((x) => x.id)).toEqual([hausA]);
  });

  it("fremder Nutzer liest nichts aus Haushalt A", async () => {
    const r = await als(db, fremd, (q) => q("select id from public.haushalte where id = $1", [hausA]));
    expect(r.rowCount).toBe(0);
  });

  it("fremder Nutzer ändert Haushalt A nicht", async () => {
    await als(db, fremd, async (q) => {
      const r = await q("update public.haushalte set name = 'gekapert' where id = $1", [hausA]);
      expect(r.rowCount).toBe(0);
    });
    const r = await db.query("select name from public.haushalte where id = $1", [hausA]);
    expect(r.rows[0].name).toBe("Haushalt A");
  });

  it("Mitglied darf ändern (gleiche Rechte, auch Einstellungen)", async () => {
    await als(db, erika, async (q) => {
      const r = await q("update public.haushalte set einstellungen = jsonb_set(einstellungen, '{vorlaufTage}', '30') where id = $1", [hausA]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("Mitglied kann den Haushalt nicht in einen fremden umhängen (id ändern)", async () => {
    await als(db, max, async (q) => {
      expect(await verweigert(q("update public.haushalte set id = $2 where id = $1", [hausA, hausB]))).toBe(true);
    });
  });

  it("niemand legt direkt an oder löscht über die API", async () => {
    await als(db, max, async (q) => {
      expect(await verweigert(q("insert into public.haushalte (name) values ('direkt')"))).toBe(true);
      const r = await q("delete from public.haushalte where id = $1", [hausA]);
      expect(r.rowCount).toBe(0);
    });
    await als(db, fremd, async (q) => {
      const r = await q("delete from public.haushalte where id = $1", [hausA]);
      expect(r.rowCount).toBe(0);
    });
    expect((await db.query("select 1 from public.haushalte where id = $1", [hausA])).rowCount).toBe(1);
  });

  it("anonym: kein Zugriff", async () => {
    await als(db, "anon", async (q) => {
      expect(await verweigert(q("select * from public.haushalte"))).toBe(true);
      expect(await verweigert(q("update public.haushalte set name = 'x'"))).toBe(true);
    });
  });
});

describe("mitglieder", () => {
  it("Mitglied sieht die Mitglieder des eigenen Haushalts, nicht die fremden", async () => {
    const r = await als(db, max, (q) => q("select nutzer_id from public.mitglieder order by nutzer_id"));
    expect(r.rows.map((x) => x.nutzer_id).sort()).toEqual([max.id, erika.id].sort());
  });

  it("fremder Nutzer liest keine Mitglieder von Haushalt A", async () => {
    const r = await als(db, fremd, (q) => q("select * from public.mitglieder where haushalt_id = $1", [hausA]));
    expect(r.rowCount).toBe(0);
  });

  it("fremder Nutzer kann sich nicht selbst in Haushalt A eintragen", async () => {
    await als(db, fremd, async (q) => {
      expect(await verweigert(q("insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2)", [hausA, fremd.id]))).toBe(true);
    });
  });

  it("fremder Nutzer kann niemanden aus Haushalt A entfernen oder umhängen", async () => {
    await als(db, fremd, async (q) => {
      expect((await q("delete from public.mitglieder where haushalt_id = $1", [hausA])).rowCount).toBe(0);
      expect((await q("update public.mitglieder set haushalt_id = $2 where haushalt_id = $1", [hausA, hausB])).rowCount).toBe(0);
    });
    expect((await db.query("select 1 from public.mitglieder where haushalt_id = $1", [hausA])).rowCount).toBe(2);
  });

  it("auch ein Mitglied schreibt nicht direkt in mitglieder", async () => {
    await als(db, max, async (q) => {
      expect(await verweigert(q("insert into public.mitglieder (haushalt_id, nutzer_id) values ($1, $2)", [hausB, max.id]))).toBe(true);
      expect((await q("delete from public.mitglieder where haushalt_id = $1", [hausA])).rowCount).toBe(0);
    });
  });

  it("anonym: kein Zugriff", async () => {
    await als(db, "anon", async (q) => {
      expect(await verweigert(q("select * from public.mitglieder"))).toBe(true);
    });
  });
});

describe("Funktionen", () => {
  it("haushalt_anlegen trägt den Aufrufer als einziges Mitglied ein", async () => {
    await als(db, fremd, async (q) => {
      const id = (await q("select public.haushalt_anlegen('Neu') as id")).rows[0].id;
      const m = await q("select nutzer_id from public.mitglieder where haushalt_id = $1", [id]);
      expect(m.rows.map((x) => x.nutzer_id)).toEqual([fremd.id]);
    });
  });

  it("haushalt_anlegen lehnt leeren Namen ab", async () => {
    await als(db, max, async (q) => {
      await expect(q("select public.haushalt_anlegen('   ')")).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("anonym: haushalt_anlegen und mitglied_hinzufuegen nicht aufrufbar", async () => {
    await als(db, "anon", async (q) => {
      expect(await verweigert(q("select public.haushalt_anlegen('x')"))).toBe(true);
      expect(await verweigert(q("select public.mitglied_hinzufuegen($1, 'x@beispiel.invalid')", [hausA]))).toBe(true);
    });
  });

  it("Mitglied fügt eine registrierte Person per E-Mail hinzu", async () => {
    const neu = await nutzerAnlegen(db, "neu@beispiel.invalid");
    await als(db, max, async (q) => {
      expect((await q("select public.mitglied_hinzufuegen($1, ' NEU@beispiel.invalid ') as ok", [hausA])).rows[0].ok).toBe(true);
      expect((await q("select 1 from public.mitglieder where haushalt_id = $1 and nutzer_id = $2", [hausA, neu.id])).rowCount).toBe(1);
      expect((await q("select public.mitglied_hinzufuegen($1, 'gibtsnicht@beispiel.invalid') as ok", [hausA])).rows[0].ok).toBe(false);
    });
  });

  it("fremder Nutzer fügt sich nicht über die Funktion in Haushalt A ein", async () => {
    await als(db, fremd, async (q) => {
      expect(await verweigert(q("select public.mitglied_hinzufuegen($1, $2)", [hausA, fremd.email]))).toBe(true);
    });
    expect((await db.query("select 1 from public.mitglieder where haushalt_id = $1 and nutzer_id = $2", [hausA, fremd.id])).rowCount).toBe(0);
  });

  it("ist_mitglied verrät über fremde Haushalte nur 'nein'", async () => {
    const r = await als(db, fremd, (q) => q("select public.ist_mitglied($1) as a, public.ist_mitglied($2) as b", [hausA, hausB]));
    expect([r.rows[0].a, r.rows[0].b]).toEqual([false, true]);
  });
});

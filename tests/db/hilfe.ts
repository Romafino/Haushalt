// Testhilfen für Datenbank- und RLS-Tests gegen eine lokale Postgres-Instanz.
// Alle Daten sind erfunden.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

export const DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://haushalt_test:test@localhost:5432/haushalt_test";

const WURZEL = join(__dirname, "..", "..");

/** Setzt die Testdatenbank zurück und spielt Nachbildung + alle Migrationen ein. */
export async function datenbankAufbauen(): Promise<pg.Client> {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  await db.query("drop schema if exists public cascade; drop schema if exists privat cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; create schema public;");
  await db.query(readFileSync(join(WURZEL, "tests/db/supabase-nachbildung.sql"), "utf8"));
  const ordner = join(WURZEL, "supabase/migrations");
  for (const datei of readdirSync(ordner).filter((d) => d.endsWith(".sql")).sort()) {
    await db.query(readFileSync(join(ordner, datei), "utf8"));
  }
  return db;
}

export type Nutzer = { id: string; email: string };

/** Legt einen erfundenen Nutzer in auth.users an. */
export async function nutzerAnlegen(db: pg.Client, email: string): Promise<Nutzer> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return { id, email };
}

/**
 * Führt fn als angemeldeter Nutzer (Rolle authenticated) bzw. anonym aus,
 * in einer Transaktion, die danach zurückgerollt wird.
 */
export async function als<T>(
  db: pg.Client,
  nutzer: Nutzer | "anon",
  fn: (q: (sql: string, werte?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    if (nutzer === "anon") {
      await db.query("set local role anon");
      await db.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
    } else {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: nutzer.id, role: "authenticated" }),
      ]);
    }
    // Jede Anweisung in einem Savepoint, damit ein erwarteter Fehler die Transaktion nicht abbricht.
    return await fn(async (sql, werte) => {
      await db.query("savepoint s");
      try {
        const r = await db.query(sql, werte as unknown[]);
        await db.query("release savepoint s");
        return r;
      } catch (e) {
        await db.query("rollback to savepoint s");
        throw e;
      }
    });
  } finally {
    await db.query("rollback");
  }
}

/** Erwartet, dass die Anweisung mit einem Rechtefehler scheitert. */
export async function verweigert(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    const code = (e as { code?: string }).code;
    // 42501 = insufficient_privilege (auch bei RLS-Verstoß beim Einfügen)
    return code === "42501";
  }
}

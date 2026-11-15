# Haushalt
Private Haushalts-App (Versicherungen, Verträge, etc). Konzept: `KONZEPT.md`, Regeln: `CLAUDE.md`.

## Entwicklung

```bash
npm install
npm run dev
```

Umgebungsvariablen: siehe `.env.example` (in `.env.local` bzw. Vercel eintragen, nie committen).

## Tests

- `npm test`: Datenbank- und RLS-Tests gegen eine lokale Postgres-Datenbank (`TEST_DATABASE_URL`).
  Die Teile von Supabase, die die Migrationen brauchen, bildet `tests/db/supabase-nachbildung.sql` nach.
- `npm run test:alt`: Tests des Altbestands (`altbestand/tests`).
- `npm run test:alle`: beides.

Lokale Testdatenbank einmalig anlegen (Postgres 16):

```bash
sudo -u postgres psql -c "create role haushalt_test login superuser password 'test'"
sudo -u postgres createdb -O haushalt_test haushalt_test
```

## Supabase-Projekt einrichten

1. Projekt in Region Frankfurt (eu-central-1) anlegen, Plan Free.
2. Migrationen aus `supabase/migrations` der Reihe nach im SQL-Editor ausführen (oder Supabase CLI).
3. Unter Authentication die freie Registrierung abschalten [prüfen: genaue Bezeichnung der Einstellung].
4. Zwei Zugänge (Vater, Mutter) im Dashboard anlegen. Ein Elternteil legt in der App den Haushalt an
   und fügt den anderen per E-Mail hinzu.

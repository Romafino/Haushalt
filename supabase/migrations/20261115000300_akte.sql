-- Schritt 3: Tabellen der Akte (Firmen, Dinge, Verträge, Bezüge, Fassungen, Belege, Termine, Ereignisse).
-- Regeln:
--  * jede Tabelle hat haushalt_id und RLS "nur Mitglieder des Haushalts" (lesen, anlegen, ändern, löschen)
--  * Verweise zwischen Tabellen gehen immer über (haushalt_id, id): ein Eintrag kann nie auf einen fremden Haushalt zeigen
--  * Standard ist verwerfen (verworfen_am); endgültig löschen nur mit Rückfrage in der Oberfläche
--  * Kaskade (entschieden 15.11.2026): Vertrag nimmt Fassungen, Bezüge und Zeitleiste mit; Belege und Termine
--    bleiben und verlieren nur die Zuordnung
--  * keine Vertrags-, Kunden-, Versicherungsnummern, IBAN, Geburtsdaten: dafür gibt es keine Spalten
-- Abweichung vom Konzept, bewusst: aktuelle Werte (Beitrag, Laufzeit, Frist …) stehen auch am Vertrag, die Tabelle
-- fassungen hält den Verlauf. So rechnet das übernommene Regelmodul (standAm, fassungOps).

-- Hilfsfunktion: geaendert_am pflegen
create function privat.geaendert() returns trigger language plpgsql set search_path = '' as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

-- Firmen ------------------------------------------------------------------------------------------
create table public.firmen (
  id           uuid primary key default gen_random_uuid(),
  haushalt_id  uuid not null references public.haushalte (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 200),
  art          text check (length(art) <= 60),
  telefon      text check (length(telefon) <= 60),
  email        text check (length(email) <= 200),
  hotline      text check (length(hotline) <= 60),
  web          text check (length(web) <= 300),
  notiz        text check (length(notiz) <= 2000),
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  verworfen_am timestamptz,
  unique (haushalt_id, id)
);

-- Dinge -------------------------------------------------------------------------------------------
create table public.dinge (
  id           uuid primary key default gen_random_uuid(),
  haushalt_id  uuid not null references public.haushalte (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 200),
  kategorie    text not null default 'Haus' check (length(kategorie) between 1 and 60),
  hersteller   text check (length(hersteller) <= 100),
  modell       text check (length(modell) <= 100),
  jahr         int check (jahr between 1800 and 2200),
  status       text not null default 'aktiv' check (status in ('aktiv', 'ersetzt', 'verkauft')),
  notiz        text check (length(notiz) <= 2000),
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  verworfen_am timestamptz,
  unique (haushalt_id, id)
);

-- Verträge ----------------------------------------------------------------------------------------
create table public.vertraege (
  id                 uuid primary key default gen_random_uuid(),
  haushalt_id        uuid not null references public.haushalte (id) on delete cascade,
  kurzname           text not null check (length(trim(kurzname)) between 1 and 120),
  art                text not null check (length(art) between 1 and 60),
  firma_id           uuid,
  status             text not null default 'aktiv' check (status in ('angebot', 'aktiv', 'gekuendigt', 'beendet', 'ersetzt')),
  beitrag            numeric(12, 2) check (beitrag >= 0),
  zahlweise          text check (zahlweise in ('monatlich', 'zweimonatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich', 'woechentlich', 'vierzehntaegig', 'einmalig')),
  laufzeitende       date,
  erstlaufzeit_ende  date,
  frist_wert         int check (frist_wert between 0 and 999),
  frist_einheit      text check (frist_einheit in ('Monate', 'Wochen', 'Tage')),
  verlaengerung      text check (verlaengerung in ('12m', 'unbefristet', 'vertrag')),
  abschluss          date,
  beginn             date,
  kuendigungsweg     text check (length(kuendigungsweg) <= 300),
  online             boolean not null default false,
  gekuendigt_am      date,
  gekuendigt_zum     date,
  bestaetigt         boolean not null default false,
  ersetzt_durch_id   uuid,
  notiz              text check (length(notiz) <= 2000),
  erstellt_am        timestamptz not null default now(),
  geaendert_am       timestamptz not null default now(),
  verworfen_am       timestamptz,
  unique (haushalt_id, id),
  foreign key (haushalt_id, firma_id) references public.firmen (haushalt_id, id) on delete set null (firma_id),
  foreign key (haushalt_id, ersetzt_durch_id) references public.vertraege (haushalt_id, id) on delete set null (ersetzt_durch_id),
  check (ersetzt_durch_id is null or ersetzt_durch_id <> id)
);

-- Mehrere Bezüge je Vertrag: Dinge und Rollen (haupt = Hauptbezug)
create table public.vertrag_dinge (
  haushalt_id uuid not null references public.haushalte (id) on delete cascade,
  vertrag_id  uuid not null,
  ding_id     uuid not null,
  haupt       boolean not null default false,
  primary key (vertrag_id, ding_id),
  foreign key (haushalt_id, vertrag_id) references public.vertraege (haushalt_id, id) on delete cascade,
  foreign key (haushalt_id, ding_id) references public.dinge (haushalt_id, id) on delete cascade
);
create unique index vertrag_dinge_ein_haupt on public.vertrag_dinge (vertrag_id) where haupt;

create table public.vertrag_rollen (
  haushalt_id uuid not null references public.haushalte (id) on delete cascade,
  vertrag_id  uuid not null,
  rolle       text not null check (length(trim(rolle)) between 1 and 60),
  haupt       boolean not null default false,
  primary key (vertrag_id, rolle),
  foreign key (haushalt_id, vertrag_id) references public.vertraege (haushalt_id, id) on delete cascade
);
create unique index vertrag_rollen_ein_haupt on public.vertrag_rollen (vertrag_id) where haupt;

-- Fassungen: Verlauf der Vertragswerte (gültig von/bis)
create table public.fassungen (
  id            uuid primary key default gen_random_uuid(),
  haushalt_id   uuid not null references public.haushalte (id) on delete cascade,
  vertrag_id    uuid not null,
  gueltig_von   date not null,
  gueltig_bis   date,
  grund         text check (length(grund) <= 200),
  beitrag       numeric(12, 2) check (beitrag >= 0),
  zahlweise     text check (zahlweise in ('monatlich', 'zweimonatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich', 'woechentlich', 'vierzehntaegig', 'einmalig')),
  laufzeitende  date,
  frist_wert    int check (frist_wert between 0 and 999),
  frist_einheit text check (frist_einheit in ('Monate', 'Wochen', 'Tage')),
  verlaengerung text check (verlaengerung in ('12m', 'unbefristet', 'vertrag')),
  dokument_id   uuid, -- Verweis auf dokumente folgt in Schritt 5
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  verworfen_am  timestamptz,
  unique (haushalt_id, id),
  foreign key (haushalt_id, vertrag_id) references public.vertraege (haushalt_id, id) on delete cascade,
  check (gueltig_bis is null or gueltig_bis >= gueltig_von)
);

-- Belege ------------------------------------------------------------------------------------------
create table public.belege (
  id                   uuid primary key default gen_random_uuid(),
  haushalt_id          uuid not null references public.haushalte (id) on delete cascade,
  titel                text not null check (length(trim(titel)) between 1 and 200),
  datum                date,
  firma_id             uuid,
  ding_id              uuid,
  betrag               numeric(12, 2) check (betrag >= 0),
  arbeitskosten        numeric(12, 2) check (arbeitskosten >= 0),
  steuer               text not null default '-' check (steuer in ('-', 'handwerker', 'haushaltsnah')),
  unbar                boolean not null default false,
  uebergabe            date,
  gew_art              text check (gew_art in ('keine', 'kauf', 'bauwerk', 'wartung')),
  gewaehrleistung_bis  date,
  notiz                text check (length(notiz) <= 2000),
  erstellt_am          timestamptz not null default now(),
  geaendert_am         timestamptz not null default now(),
  verworfen_am         timestamptz,
  unique (haushalt_id, id),
  foreign key (haushalt_id, firma_id) references public.firmen (haushalt_id, id) on delete set null (firma_id),
  foreign key (haushalt_id, ding_id) references public.dinge (haushalt_id, id) on delete set null (ding_id)
);

-- Termine: eigene Termine und Merker zu abgeleiteten Fristen (schluessel z. B. 'kb_<vertrag>')
create table public.termine (
  id                  uuid primary key default gen_random_uuid(),
  haushalt_id         uuid not null references public.haushalte (id) on delete cascade,
  schluessel          text check (schluessel ~ '^[a-z]+_[0-9a-f-]{36}$'),
  abgeleitet          boolean not null default false,
  titel               text check (length(titel) <= 200),
  datum               date,
  notiz               text check (length(notiz) <= 2000),
  vorlauf_tage        int check (vorlauf_tage between 0 and 365),
  wiederholung_monate int check (wiederholung_monate between 1 and 120),
  status              text not null default 'offen' check (status in ('offen', 'erledigt')),
  erledigt_fuer       date,
  quelle              text check (length(quelle) <= 30),
  vertrag_id          uuid,
  ding_id             uuid,
  beleg_id            uuid,
  kal_datum           date,
  kal_alt             date[],
  kal_titel           text check (length(kal_titel) <= 200),
  erstellt_am         timestamptz not null default now(),
  geaendert_am        timestamptz not null default now(),
  verworfen_am        timestamptz,
  unique (haushalt_id, id),
  unique (haushalt_id, schluessel),
  check (abgeleitet or (titel is not null and length(trim(titel)) > 0)),
  foreign key (haushalt_id, vertrag_id) references public.vertraege (haushalt_id, id) on delete set null (vertrag_id),
  foreign key (haushalt_id, ding_id) references public.dinge (haushalt_id, id) on delete set null (ding_id),
  foreign key (haushalt_id, beleg_id) references public.belege (haushalt_id, id) on delete set null (beleg_id)
);

-- Ereignisse: Zeitleiste je Vertrag/Ding (schluessel für automatische Einträge, damit nichts doppelt entsteht)
create table public.ereignisse (
  id            uuid primary key default gen_random_uuid(),
  haushalt_id   uuid not null references public.haushalte (id) on delete cascade,
  schluessel    text check (length(schluessel) <= 120),
  datum         date not null,
  typ           text not null check (length(typ) between 1 and 30),
  text          text not null check (length(text) <= 2000),
  vertrag_id    uuid,
  ding_id       uuid,
  dokument_id   uuid, -- Verweis auf dokumente folgt in Schritt 5
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  verworfen_am  timestamptz,
  unique (haushalt_id, id),
  unique (haushalt_id, schluessel),
  foreign key (haushalt_id, vertrag_id) references public.vertraege (haushalt_id, id) on delete cascade,
  foreign key (haushalt_id, ding_id) references public.dinge (haushalt_id, id) on delete cascade
);

-- Indizes für Verweise
create index on public.vertraege (haushalt_id, firma_id);
create index on public.vertraege (haushalt_id, ersetzt_durch_id);
create index on public.vertrag_dinge (haushalt_id, ding_id);
create index on public.fassungen (haushalt_id, vertrag_id);
create index on public.belege (haushalt_id, firma_id);
create index on public.belege (haushalt_id, ding_id);
create index on public.termine (haushalt_id, vertrag_id);
create index on public.termine (haushalt_id, ding_id);
create index on public.termine (haushalt_id, beleg_id);
create index on public.ereignisse (haushalt_id, vertrag_id);
create index on public.ereignisse (haushalt_id, ding_id);

-- RLS, Rechte, geaendert_am ------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['firmen', 'dinge', 'vertraege', 'vertrag_dinge', 'vertrag_rollen', 'fassungen', 'belege', 'termine', 'ereignisse'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (privat.ist_mitglied(haushalt_id))', t || '_lesen', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (privat.ist_mitglied(haushalt_id))', t || '_anlegen', t);
    execute format('create policy %I on public.%I for update to authenticated using (privat.ist_mitglied(haushalt_id)) with check (privat.ist_mitglied(haushalt_id))', t || '_aendern', t);
    execute format('create policy %I on public.%I for delete to authenticated using (privat.ist_mitglied(haushalt_id))', t || '_loeschen', t);
    if t not in ('vertrag_dinge', 'vertrag_rollen') then
      execute format('create trigger geaendert before update on public.%I for each row execute function privat.geaendert()', t);
    end if;
  end loop;
end $$;

revoke all on function privat.geaendert() from public, anon, authenticated;

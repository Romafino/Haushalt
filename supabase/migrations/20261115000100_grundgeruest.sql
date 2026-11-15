-- Schritt 1: Haushalt, Mitglieder, RLS-Grundregel.
-- Regel überall: lesen und schreiben nur, wenn der angemeldete Nutzer Mitglied des Haushalts ist.

create extension if not exists pgcrypto;

-- Haushalt ------------------------------------------------------------------
create table public.haushalte (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 100),
  -- Vorlauf in Tagen (Standard 42), Texte, KI-Anbieter je Aufgabe, KI-Limit
  einstellungen jsonb not null default '{"vorlaufTage": 42, "kiLimitEuro": 10, "kiWarnungProzent": 80}'::jsonb,
  erstellt_am   timestamptz not null default now(),
  verworfen_am  timestamptz
);

-- Mitglieder: Haushalt <-> Nutzer. Beide Eltern haben gleiche Rechte.
create table public.mitglieder (
  haushalt_id uuid not null references public.haushalte (id) on delete cascade,
  nutzer_id   uuid not null references auth.users (id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  primary key (haushalt_id, nutzer_id)
);
create index mitglieder_nutzer_idx on public.mitglieder (nutzer_id);

-- Hilfsfunktion für alle RLS-Regeln ------------------------------------------
-- security definer, damit die Regel auf "mitglieder" sich nicht selbst aufruft.
create function public.ist_mitglied(p_haushalt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mitglieder m
    where m.haushalt_id = p_haushalt_id
      and m.nutzer_id = (select auth.uid())
  );
$$;

-- RLS -------------------------------------------------------------------------
alter table public.haushalte  enable row level security;
alter table public.mitglieder enable row level security;

-- Haushalte: Mitglieder lesen und ändern. Anlegen nur über haushalt_anlegen().
-- Kein Löschen über die API (nichts wird stillschweigend gelöscht).
create policy haushalte_lesen on public.haushalte
  for select to authenticated
  using (public.ist_mitglied(id));

create policy haushalte_aendern on public.haushalte
  for update to authenticated
  using (public.ist_mitglied(id))
  with check (public.ist_mitglied(id));

-- Mitglieder: sehen, wer zum eigenen Haushalt gehört.
-- Hinzufügen nur über mitglied_hinzufuegen(); direktes Schreiben ist gesperrt.
create policy mitglieder_lesen on public.mitglieder
  for select to authenticated
  using (public.ist_mitglied(haushalt_id));

-- Funktionen ------------------------------------------------------------------
-- Legt einen Haushalt an und trägt den aufrufenden Nutzer als Mitglied ein.
create function public.haushalt_anlegen(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nutzer uuid := (select auth.uid());
  v_id uuid;
begin
  if v_nutzer is null then
    raise exception 'nicht angemeldet' using errcode = '42501';
  end if;
  insert into public.haushalte (name) values (p_name) returning id into v_id;
  insert into public.mitglieder (haushalt_id, nutzer_id) values (v_id, v_nutzer);
  return v_id;
end;
$$;

-- Ein Mitglied fügt eine weitere, bereits registrierte Person per E-Mail hinzu.
-- Gibt bewusst nicht preis, ob die E-Mail existiert (nur "hinzugefügt: ja/nein").
create function public.mitglied_hinzufuegen(p_haushalt_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neu uuid;
begin
  if not public.ist_mitglied(p_haushalt_id) then
    raise exception 'kein Zugriff' using errcode = '42501';
  end if;
  select u.id into v_neu from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_neu is null then
    return false;
  end if;
  insert into public.mitglieder (haushalt_id, nutzer_id)
  values (p_haushalt_id, v_neu)
  on conflict do nothing;
  return true;
end;
$$;

-- Rechte: Tabellen nur für angemeldete Nutzer, anonym gar nichts.
revoke all on public.haushalte, public.mitglieder from anon;
revoke all on function public.ist_mitglied(uuid) from public, anon;
revoke all on function public.haushalt_anlegen(text) from public, anon;
revoke all on function public.mitglied_hinzufuegen(uuid, text) from public, anon;
grant execute on function public.ist_mitglied(uuid) to authenticated;
grant execute on function public.haushalt_anlegen(text) to authenticated;
grant execute on function public.mitglied_hinzufuegen(uuid, text) to authenticated;

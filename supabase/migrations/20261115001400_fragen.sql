-- Gespeicherte Fragen an die Akte: nur über „Zur Akte“, nur die Platzhalter-Fassung (Namen setzt erst das Gerät ein).
create table public.fragen (
  id           uuid primary key default gen_random_uuid(),
  haushalt_id  uuid not null references public.haushalte (id) on delete cascade,
  frage        text not null check (length(frage) between 3 and 1000),
  antwort      text not null check (length(antwort) between 1 and 20000),
  tochter      text check (length(tochter) <= 5000),
  stichtag     date not null,
  quellen      jsonb not null default '[]' check (jsonb_typeof(quellen) = 'array'),
  erstellt_von uuid default auth.uid() references auth.users (id) on delete set null,
  erstellt_am  timestamptz not null default now(),
  verworfen_am timestamptz
);
create index on public.fragen (haushalt_id, erstellt_am desc);
alter table public.fragen enable row level security;
revoke all on public.fragen from anon;
create policy fragen_lesen on public.fragen for select to authenticated using (privat.ist_mitglied(haushalt_id));
create policy fragen_anlegen on public.fragen for insert to authenticated with check (privat.ist_mitglied(haushalt_id));
create policy fragen_aendern on public.fragen for update to authenticated using (privat.ist_mitglied(haushalt_id)) with check (privat.ist_mitglied(haushalt_id));
create policy fragen_loeschen on public.fragen for delete to authenticated using (privat.ist_mitglied(haushalt_id));

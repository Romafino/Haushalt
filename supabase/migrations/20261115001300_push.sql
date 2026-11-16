-- Web-Push: Geräte, die Erinnerungen bekommen. Jede Person sieht und verwaltet nur ihre eigenen Geräte im eigenen Haushalt.
-- Versand nur durch den täglichen Lauf (Service-Role) und die Test-Nachricht an die eigenen Geräte.
create table public.push_abos (
  id          uuid primary key default gen_random_uuid(),
  haushalt_id uuid not null references public.haushalte (id) on delete cascade,
  nutzer_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh      text not null check (length(p256dh) between 20 and 200),
  auth        text not null check (length(auth) between 10 and 100),
  geraet      text check (length(geraet) <= 100),
  erstellt_am timestamptz not null default now()
);
create index on public.push_abos (haushalt_id);
alter table public.push_abos enable row level security;
revoke all on public.push_abos from anon;
create policy push_abos_lesen on public.push_abos for select to authenticated
  using (privat.ist_mitglied(haushalt_id) and nutzer_id = auth.uid());
create policy push_abos_anlegen on public.push_abos for insert to authenticated
  with check (privat.ist_mitglied(haushalt_id) and nutzer_id = auth.uid());
create policy push_abos_aendern on public.push_abos for update to authenticated
  using (privat.ist_mitglied(haushalt_id) and nutzer_id = auth.uid())
  with check (privat.ist_mitglied(haushalt_id) and nutzer_id = auth.uid());
create policy push_abos_loeschen on public.push_abos for delete to authenticated
  using (privat.ist_mitglied(haushalt_id) and nutzer_id = auth.uid());

-- Schwärzliste: EIN verschlüsselter Block je Haushalt (PBKDF2-SHA256 + AES-GCM, im Browser ver- und entschlüsselt).
-- Der Server sieht nie Klartext und nie das Passwort. Format wie im Altbestand: { v, salz, iter, iv, daten } (Base64).
-- Die Prüfungen verhindern, dass versehentlich Klartext (z. B. JSON) gespeichert wird.

create table public.schwaerzliste (
  haushalt_id  uuid primary key references public.haushalte (id) on delete cascade,
  v            int not null default 1 check (v = 1),
  salz         text not null check (salz ~ '^[A-Za-z0-9+/]{22}==$'),            -- 16 Byte
  iter         int not null check (iter between 100000 and 10000000),
  iv           text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),                 -- 12 Byte
  daten        text not null check (daten ~ '^[A-Za-z0-9+/]+={0,2}$' and length(daten) between 24 and 2000000),
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);

alter table public.schwaerzliste enable row level security;
revoke all on public.schwaerzliste from anon;
create policy schwaerzliste_lesen on public.schwaerzliste for select to authenticated using (privat.ist_mitglied(haushalt_id));
create policy schwaerzliste_anlegen on public.schwaerzliste for insert to authenticated with check (privat.ist_mitglied(haushalt_id));
create policy schwaerzliste_aendern on public.schwaerzliste for update to authenticated using (privat.ist_mitglied(haushalt_id)) with check (privat.ist_mitglied(haushalt_id));
create policy schwaerzliste_loeschen on public.schwaerzliste for delete to authenticated using (privat.ist_mitglied(haushalt_id));

create function privat.schwaerzliste_stempel() returns trigger language plpgsql set search_path = '' as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end;
$$;
revoke all on function privat.schwaerzliste_stempel() from public, anon, authenticated;
create trigger stempel before insert or update on public.schwaerzliste for each row execute function privat.schwaerzliste_stempel();

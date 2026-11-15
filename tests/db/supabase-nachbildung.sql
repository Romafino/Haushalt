-- NUR FÜR TESTS: bildet die Teile von Supabase nach, die unsere Migrationen brauchen
-- (Rollen anon/authenticated/service_role, auth.users, auth.uid(), Standardrechte).
-- In echtem Supabase existiert das bereits; diese Datei wird dort nie ausgeführt.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

grant anon, authenticated, service_role to current_user;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key,
  email text unique
);

-- wie in Supabase: Nutzer-ID aus den JWT-Angaben der Anfrage
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- wie in Supabase: Standardrechte auf neue Objekte im Schema public.
-- Schutz kommt also allein aus RLS und den revoke-Anweisungen der Migrationen.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

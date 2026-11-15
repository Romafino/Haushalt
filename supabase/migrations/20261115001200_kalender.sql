-- Kalender-Abo: geheimer Link je Haushalt. Gespeichert wird nur der SHA-256-Hash des Schlüssels; der Schlüssel entsteht im Browser.
-- Der Kalender ruft ohne Anmeldung ab. Dafür gibt es eine eng begrenzte Funktion (kein Service-Role-Schlüssel):
-- sie liefert nur die Tabellen, die für Fristen und Termine nötig sind, und nur für den Haushalt mit passendem Hash.
create table public.kalender_zugang (
  haushalt_id uuid primary key references public.haushalte (id) on delete cascade,
  hash        text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  erstellt_am timestamptz not null default now()
);
alter table public.kalender_zugang enable row level security;
revoke all on public.kalender_zugang from anon;
create policy kalender_zugang_lesen on public.kalender_zugang for select to authenticated using (privat.ist_mitglied(haushalt_id));
create policy kalender_zugang_anlegen on public.kalender_zugang for insert to authenticated with check (privat.ist_mitglied(haushalt_id));
create policy kalender_zugang_aendern on public.kalender_zugang for update to authenticated using (privat.ist_mitglied(haushalt_id)) with check (privat.ist_mitglied(haushalt_id));
create policy kalender_zugang_loeschen on public.kalender_zugang for delete to authenticated using (privat.ist_mitglied(haushalt_id));

create or replace function public.kalender_daten(p_schluessel text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  h uuid;
begin
  if p_schluessel is null or p_schluessel !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  select k.haushalt_id into h from public.kalender_zugang k
   where k.hash = encode(pg_catalog.sha256(convert_to(p_schluessel, 'UTF8')), 'hex');
  if h is null then return null; end if;
  return jsonb_build_object(
    'haushalt', (select jsonb_build_object('einstellungen', x.einstellungen) from public.haushalte x where x.id = h and x.verworfen_am is null),
    'firmen', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name)) from public.firmen t where t.haushalt_id = h and t.verworfen_am is null), '[]'),
    'dinge', coalesce((select jsonb_agg(to_jsonb(t)) from public.dinge t where t.haushalt_id = h and t.verworfen_am is null), '[]'),
    'vertraege', coalesce((select jsonb_agg(to_jsonb(t)) from public.vertraege t where t.haushalt_id = h and t.verworfen_am is null), '[]'),
    'vertrag_dinge', coalesce((select jsonb_agg(to_jsonb(t)) from public.vertrag_dinge t where t.haushalt_id = h), '[]'),
    'vertrag_rollen', coalesce((select jsonb_agg(to_jsonb(t)) from public.vertrag_rollen t where t.haushalt_id = h), '[]'),
    'fassungen', coalesce((select jsonb_agg(to_jsonb(t)) from public.fassungen t where t.haushalt_id = h and t.verworfen_am is null), '[]'),
    'belege', coalesce((select jsonb_agg(to_jsonb(t)) from public.belege t where t.haushalt_id = h and t.verworfen_am is null), '[]'),
    'termine', coalesce((select jsonb_agg(to_jsonb(t)) from public.termine t where t.haushalt_id = h and t.verworfen_am is null), '[]'),
    'ereignisse', coalesce((select jsonb_agg(to_jsonb(t)) from public.ereignisse t where t.haushalt_id = h and t.verworfen_am is null), '[]'),
    'dokumente', '[]'::jsonb
  );
end $$;
revoke all on function public.kalender_daten(text) from public;
grant execute on function public.kalender_daten(text) to anon, authenticated;

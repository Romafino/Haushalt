-- Schadenfall (KONZEPT 7.3): Fall, betroffene Dinge, Prüfung je Police, Fotos, Verlauf (ereignisse) und Termine mit Bezug.
-- Beschreibung wird auf dem Gerät gegen die Schwärzliste ersetzt. Schadenfotos dürfen ungeschwärzt gespeichert werden, gehen nie an eine KI.

create table public.schadenfaelle (
  id           uuid primary key default gen_random_uuid(),
  haushalt_id  uuid not null references public.haushalte (id) on delete cascade,
  datum        date not null,
  titel        text not null check (length(titel) between 1 and 200),
  beschreibung text not null check (length(beschreibung) between 5 and 5000),
  status       text not null default 'offen' check (status in ('offen', 'gemeldet', 'in_bearbeitung', 'reguliert', 'abgelehnt', 'erledigt')),
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  verworfen_am timestamptz,
  unique (haushalt_id, id)
);
create index on public.schadenfaelle (haushalt_id, datum desc);

create table public.schaden_dinge (
  haushalt_id uuid not null references public.haushalte (id) on delete cascade,
  schaden_id  uuid not null,
  ding_id     uuid not null,
  primary key (schaden_id, ding_id),
  foreign key (haushalt_id, schaden_id) references public.schadenfaelle (haushalt_id, id) on delete cascade,
  foreign key (haushalt_id, ding_id) references public.dinge (haushalt_id, id) on delete cascade
);
create index on public.schaden_dinge (haushalt_id);

create table public.schaden_pruefungen (
  id                uuid primary key default gen_random_uuid(),
  haushalt_id       uuid not null references public.haushalte (id) on delete cascade,
  schaden_id        uuid not null,
  vertrag_id        uuid not null,
  greift            text not null check (greift in ('ja', 'nein', 'unklar')),
  andere_sparte     boolean not null default false,
  begruendung       text not null default '' check (length(begruendung) <= 4000),
  fundstellen       jsonb not null default '[]' check (jsonb_typeof(fundstellen) = 'array'),
  ausschluesse      jsonb not null default '[]' check (jsonb_typeof(ausschluesse) = 'array'),
  selbstbeteiligung text check (length(selbstbeteiligung) <= 300),
  pflichten         jsonb not null default '[]' check (jsonb_typeof(pflichten) = 'array'),
  fristen           jsonb not null default '[]' check (jsonb_typeof(fristen) = 'array'),
  offene_fragen     jsonb not null default '[]' check (jsonb_typeof(offene_fragen) = 'array'),
  fassung_von       date,
  dokument_id       uuid,
  steckbrief_von    date,
  geprueft_am       timestamptz not null default now(),
  unique (schaden_id, vertrag_id),
  foreign key (haushalt_id, schaden_id) references public.schadenfaelle (haushalt_id, id) on delete cascade,
  foreign key (haushalt_id, vertrag_id) references public.vertraege (haushalt_id, id) on delete cascade,
  foreign key (haushalt_id, dokument_id) references public.dokumente (haushalt_id, id) on delete set null (dokument_id)
);
create index on public.schaden_pruefungen (haushalt_id, schaden_id);

create table public.schaden_fotos (
  id          uuid primary key default gen_random_uuid(),
  haushalt_id uuid not null references public.haushalte (id) on delete cascade,
  schaden_id  uuid not null,
  pfad        text not null unique,
  erstellt_am timestamptz not null default now(),
  foreign key (haushalt_id, schaden_id) references public.schadenfaelle (haushalt_id, id) on delete cascade,
  check (pfad = haushalt_id::text || '/' || schaden_id::text || '/' || id::text || '.jpg')
);
create index on public.schaden_fotos (haushalt_id, schaden_id);

-- Verlauf und Termine bekommen einen Bezug zum Schadenfall
alter table public.ereignisse add column schaden_id uuid;
alter table public.ereignisse add foreign key (haushalt_id, schaden_id) references public.schadenfaelle (haushalt_id, id) on delete cascade;
alter table public.termine add column schaden_id uuid;
alter table public.termine add foreign key (haushalt_id, schaden_id) references public.schadenfaelle (haushalt_id, id) on delete cascade;

-- RLS: nur Mitglieder (wie alle Tabellen)
do $$
declare
  t text;
begin
  foreach t in array array['schadenfaelle', 'schaden_dinge', 'schaden_pruefungen', 'schaden_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (privat.ist_mitglied(haushalt_id))', t || '_lesen', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (privat.ist_mitglied(haushalt_id))', t || '_anlegen', t);
    execute format('create policy %I on public.%I for update to authenticated using (privat.ist_mitglied(haushalt_id)) with check (privat.ist_mitglied(haushalt_id))', t || '_aendern', t);
    execute format('create policy %I on public.%I for delete to authenticated using (privat.ist_mitglied(haushalt_id))', t || '_loeschen', t);
  end loop;
end $$;
create trigger geaendert before update on public.schadenfaelle for each row execute function privat.geaendert();

-- Anlegen in EINER Transaktion: Fall, Dinge, Prüfungen, Verlauf
create function public.schaden_speichern(p_haushalt_id uuid, p_schaden jsonb, p_dinge uuid[], p_pruefungen jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.schadenfaelle;
  p jsonb;
begin
  s := jsonb_populate_record(null::public.schadenfaelle, p_schaden);
  insert into public.schadenfaelle (id, haushalt_id, datum, titel, beschreibung)
  values (coalesce(s.id, gen_random_uuid()), p_haushalt_id, s.datum, s.titel, s.beschreibung)
  returning * into s;
  insert into public.schaden_dinge (haushalt_id, schaden_id, ding_id)
    select p_haushalt_id, s.id, d from unnest(coalesce(p_dinge, '{}')) d;
  for p in select * from jsonb_array_elements(coalesce(p_pruefungen, '[]')) loop
    insert into public.schaden_pruefungen (haushalt_id, schaden_id, vertrag_id, greift, andere_sparte, begruendung, fundstellen, ausschluesse,
      selbstbeteiligung, pflichten, fristen, offene_fragen, fassung_von, dokument_id, steckbrief_von)
    values (p_haushalt_id, s.id, (p ->> 'vertrag_id')::uuid, coalesce(p ->> 'greift', 'unklar'), coalesce((p ->> 'andere_sparte')::boolean, false),
      coalesce(p ->> 'begruendung', ''), coalesce(p -> 'fundstellen', '[]'), coalesce(p -> 'ausschluesse', '[]'), p ->> 'selbstbeteiligung',
      coalesce(p -> 'pflichten', '[]'), coalesce(p -> 'fristen', '[]'), coalesce(p -> 'offene_fragen', '[]'),
      (p ->> 'fassung_von')::date, (p ->> 'dokument_id')::uuid, (p ->> 'steckbrief_von')::date);
    if p ->> 'greift' <> 'nein' then
      insert into public.ereignisse (haushalt_id, datum, typ, text, vertrag_id, schaden_id)
      values (p_haushalt_id, s.datum, 'schaden', left('Schadenfall geprüft: greift ' || coalesce(p ->> 'greift', 'unklar') || ' (' || s.titel || ')', 2000), (p ->> 'vertrag_id')::uuid, s.id);
    end if;
  end loop;
  insert into public.ereignisse (haushalt_id, datum, typ, text, ding_id, schaden_id)
    select p_haushalt_id, s.datum, 'schaden', left('Schadenfall: ' || s.titel, 2000), d, s.id from unnest(coalesce(p_dinge, '{}')) d;
  insert into public.ereignisse (haushalt_id, datum, typ, text, schaden_id)
    values (p_haushalt_id, current_date, 'schaden', 'Schadenfall angelegt', s.id);
  return s.id;
end;
$$;
revoke all on function public.schaden_speichern(uuid, jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.schaden_speichern(uuid, jsonb, uuid[], jsonb) to authenticated;

-- Volltextsuche: optional nur in bestimmten Dokumenten (Schadenprüfung je Police)
drop function public.seiten_suchen(uuid, text, int);
create function public.seiten_suchen(p_haushalt uuid, p_frage text, p_max int default 12, p_dokumente uuid[] default null)
returns table (dokument_id uuid, nr int, text text, rang real)
language sql stable security invoker set search_path = '' as $$
  with woerter as (
    select distinct l.lexem
    from regexp_split_to_table(lower(left(coalesce(p_frage, ''), 500)), '[^a-zäöüß]+') as w,
         lateral unnest(to_tsvector('german', w)) as l(lexem, positions, weights)
    where length(w) >= 3
  ),
  q as (
    select to_tsquery('simple', string_agg(quote_literal(lexem) || ':*', ' | ')) as tq from woerter
  )
  select s.dokument_id, s.nr, s.text, ts_rank(s.suche, q.tq) as rang
  from public.dokument_seiten s
  join public.dokumente d on d.haushalt_id = s.haushalt_id and d.id = s.dokument_id
  cross join q
  where q.tq is not null
    and s.haushalt_id = p_haushalt
    and d.verworfen_am is null
    and (p_dokumente is null or s.dokument_id = any (p_dokumente))
    and s.suche @@ q.tq
  order by rang desc, s.dokument_id, s.nr
  limit least(greatest(coalesce(p_max, 12), 1), 12);
$$;
revoke all on function public.seiten_suchen(uuid, text, int, uuid[]) from public, anon;
grant execute on function public.seiten_suchen(uuid, text, int, uuid[]) to authenticated;

-- Schadenfotos: privater Bucket, nur Mitglieder (erster Pfadteil = Haushalt)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('schadenfotos', 'schadenfotos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
create policy schadenfotos_lesen on storage.objects for select to authenticated
  using (bucket_id = 'schadenfotos' and privat.ist_mitglied(privat.haushalt_aus_pfad(name)));
create policy schadenfotos_anlegen on storage.objects for insert to authenticated
  with check (bucket_id = 'schadenfotos' and privat.ist_mitglied(privat.haushalt_aus_pfad(name)) and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
create policy schadenfotos_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'schadenfotos' and privat.ist_mitglied(privat.haushalt_aus_pfad(name)));

-- Status ändern und im Verlauf festhalten, in EINER Transaktion
create function public.schaden_status(p_haushalt_id uuid, p_id uuid, p_status text, p_notiz text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n int;
begin
  update public.schadenfaelle set status = p_status where id = p_id and haushalt_id = p_haushalt_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Schadenfall nicht gefunden' using errcode = 'P0002'; end if;
  insert into public.ereignisse (haushalt_id, datum, typ, text, schaden_id)
  values (p_haushalt_id, current_date, 'schaden', left('Status: ' || replace(p_status, '_', ' ') || coalesce(' – ' || nullif(trim(p_notiz), ''), ''), 2000), p_id);
end;
$$;
revoke all on function public.schaden_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.schaden_status(uuid, uuid, text, text) to authenticated;

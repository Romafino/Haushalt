-- Schritt 5a: Dokumente (nur geschwärzte Fassungen), Seiten-Text mit deutscher Volltextsuche, Bilder in Storage, KI-Protokoll.
-- Abweichung vom Konzept, bewusst: der Steckbrief steht als jsonb am Dokument (so liest ihn das Regelmodul: d.steckbrief);
-- frühere Fassungen bleiben über frühere Dokumente erhalten (steckbriefAm).

create table public.dokumente (
  id           uuid primary key default gen_random_uuid(),
  haushalt_id  uuid not null references public.haushalte (id) on delete cascade,
  typ          text not null check (length(typ) between 1 and 60),
  titel        text check (length(titel) <= 200),
  datum        date,
  gueltig_von  date,
  gueltig_bis  date,
  vertrag_id   uuid,
  ding_id      uuid,
  firma_id     uuid,
  seiten       int not null default 1 check (seiten between 1 and 200),
  quelle       text check (quelle in ('pdf', 'foto')),
  datenschutz  jsonb not null default '{}'::jsonb,
  steckbrief   jsonb,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  verworfen_am timestamptz,
  unique (haushalt_id, id),
  check (gueltig_bis is null or gueltig_von is null or gueltig_bis >= gueltig_von),
  foreign key (haushalt_id, vertrag_id) references public.vertraege (haushalt_id, id) on delete set null (vertrag_id),
  foreign key (haushalt_id, ding_id) references public.dinge (haushalt_id, id) on delete set null (ding_id),
  foreign key (haushalt_id, firma_id) references public.firmen (haushalt_id, id) on delete set null (firma_id)
);
create index on public.dokumente (haushalt_id, vertrag_id);
create index on public.dokumente (haushalt_id, ding_id);
create index on public.dokumente (haushalt_id, firma_id);

-- geschwärzter Text je Seite, deutsche Volltextsuche (für „Frag die Akte“ in Schritt 8)
create table public.dokument_seiten (
  haushalt_id uuid not null references public.haushalte (id) on delete cascade,
  dokument_id uuid not null,
  nr          int not null check (nr between 1 and 200),
  text        text not null default '' check (length(text) <= 200000),
  suche       tsvector generated always as (to_tsvector('german', text)) stored,
  primary key (dokument_id, nr),
  foreign key (haushalt_id, dokument_id) references public.dokumente (haushalt_id, id) on delete cascade
);
create index dokument_seiten_suche on public.dokument_seiten using gin (suche);
create index on public.dokument_seiten (haushalt_id, dokument_id);

-- Pfad des geschwärzten Bildes in Storage: <haushalt_id>/<dokument_id>/<nr>.jpg
create table public.dokument_bilder (
  haushalt_id uuid not null references public.haushalte (id) on delete cascade,
  dokument_id uuid not null,
  nr          int not null check (nr between 1 and 200),
  pfad        text not null unique,
  primary key (dokument_id, nr),
  foreign key (haushalt_id, dokument_id) references public.dokumente (haushalt_id, id) on delete cascade,
  check (pfad = haushalt_id::text || '/' || dokument_id::text || '/' || nr::text || '.jpg')
);
create index on public.dokument_bilder (haushalt_id, dokument_id);

-- Verweise aus Schritt 3 jetzt auf dokumente
alter table public.fassungen add foreign key (haushalt_id, dokument_id) references public.dokumente (haushalt_id, id) on delete set null (dokument_id);
alter table public.ereignisse add foreign key (haushalt_id, dokument_id) references public.dokumente (haushalt_id, id) on delete set null (dokument_id);
create index on public.fassungen (haushalt_id, dokument_id);
create index on public.ereignisse (haushalt_id, dokument_id);

-- KI-Protokoll: nur Aufgabe, Anbieter, Umfang, Kosten. Niemals Inhalte.
create table public.ki_protokoll (
  id             uuid primary key default gen_random_uuid(),
  haushalt_id    uuid not null references public.haushalte (id) on delete cascade,
  zeitpunkt      timestamptz not null default now(),
  nutzer_id      uuid default auth.uid(),
  aufgabe        text not null check (aufgabe in ('dokument', 'frage', 'schaden', 'test')),
  anbieter       text not null check (length(anbieter) <= 40),
  modell         text check (length(modell) <= 80),
  seiten         int check (seiten >= 0),
  eingabe_tokens int check (eingabe_tokens >= 0),
  ausgabe_tokens int check (ausgabe_tokens >= 0),
  kosten_cent    numeric(10, 4) not null default 0 check (kosten_cent >= 0),
  erfolg         boolean not null default true
);
create index on public.ki_protokoll (haushalt_id, zeitpunkt);

do $$
declare
  t text;
begin
  foreach t in array array['dokumente', 'dokument_seiten', 'dokument_bilder'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (privat.ist_mitglied(haushalt_id))', t || '_lesen', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (privat.ist_mitglied(haushalt_id))', t || '_anlegen', t);
    execute format('create policy %I on public.%I for update to authenticated using (privat.ist_mitglied(haushalt_id)) with check (privat.ist_mitglied(haushalt_id))', t || '_aendern', t);
    execute format('create policy %I on public.%I for delete to authenticated using (privat.ist_mitglied(haushalt_id))', t || '_loeschen', t);
  end loop;
end $$;
create trigger geaendert before update on public.dokumente for each row execute function privat.geaendert();

-- Protokoll: lesen und anlegen (durch die Server-Route mit der Anmeldung der Person), nie ändern oder löschen
alter table public.ki_protokoll enable row level security;
revoke all on public.ki_protokoll from anon;
revoke update, delete on public.ki_protokoll from authenticated;
create policy ki_protokoll_lesen on public.ki_protokoll for select to authenticated using (privat.ist_mitglied(haushalt_id));
create policy ki_protokoll_anlegen on public.ki_protokoll for insert to authenticated with check (privat.ist_mitglied(haushalt_id) and nutzer_id = auth.uid());

-- Dokument mit Seiten, Bildern und Folgen (Schreib-Schritte des Regelmoduls) in EINER Transaktion speichern.
-- Die Dokument-ID erzeugt das Gerät vorab (sie steht schon im Storage-Pfad der Bilder).
create function public.dokument_speichern(p_haushalt_id uuid, p_dokument jsonb, p_seiten jsonb, p_bilder jsonb, p_ops jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d public.dokumente;
  v_fremd text;
  v_erlaubt constant text[] := array['id', 'typ', 'titel', 'datum', 'gueltig_von', 'gueltig_bis', 'vertrag_id', 'ding_id', 'firma_id', 'seiten', 'quelle', 'datenschutz', 'steckbrief'];
begin
  select k into v_fremd from jsonb_object_keys(p_dokument) k where k <> all (v_erlaubt) limit 1;
  if v_fremd is not null then
    raise exception 'unbekanntes Feld: %', v_fremd using errcode = '22023';
  end if;
  if (p_dokument ->> 'id') is null then
    raise exception 'Dokument-ID fehlt' using errcode = '22023';
  end if;
  d := jsonb_populate_record(null::public.dokumente, p_dokument);
  insert into public.dokumente (id, haushalt_id, typ, titel, datum, gueltig_von, gueltig_bis, vertrag_id, ding_id, firma_id, seiten, quelle, datenschutz, steckbrief)
  values (d.id, p_haushalt_id, d.typ, d.titel, d.datum, d.gueltig_von, d.gueltig_bis, d.vertrag_id, d.ding_id, d.firma_id,
    coalesce(d.seiten, 1), d.quelle, coalesce(d.datenschutz, '{}'::jsonb), d.steckbrief);
  insert into public.dokument_seiten (haushalt_id, dokument_id, nr, text)
    select p_haushalt_id, d.id, (s ->> 'nr')::int, coalesce(s ->> 'text', '') from jsonb_array_elements(p_seiten) s;
  insert into public.dokument_bilder (haushalt_id, dokument_id, nr, pfad)
    select p_haushalt_id, d.id, (b ->> 'nr')::int, b ->> 'pfad' from jsonb_array_elements(p_bilder) b;
  if jsonb_array_length(p_ops) > 0 then
    perform public.ops_anwenden(p_haushalt_id, p_ops);
  end if;
  return d.id;
end;
$$;
revoke all on function public.dokument_speichern(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.dokument_speichern(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- Storage: privater Bucket, Zugriff nur für Mitglieder des Haushalts im ersten Pfadteil
create function privat.haushalt_aus_pfad(p_name text) returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;
grant execute on function privat.haushalt_aus_pfad(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dokumente', 'dokumente', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy dokumente_lesen on storage.objects for select to authenticated
  using (bucket_id = 'dokumente' and privat.ist_mitglied(privat.haushalt_aus_pfad(name)));
create policy dokumente_anlegen on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumente' and privat.ist_mitglied(privat.haushalt_aus_pfad(name)) and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{1,3}\.jpg$');
create policy dokumente_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'dokumente' and privat.ist_mitglied(privat.haushalt_aus_pfad(name)));

-- Trigramm-Suche und Dublettenerkennung (KONZEPT 13.5, 13.6). Erweiterung pg_trgm im Schema extensions (Supabase-Konvention).
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
grant usage on schema extensions to authenticated; -- bei Supabase ohnehin vorhanden

-- Index für Teilwort-Suche (ILIKE) und Ähnlichkeit auf den geschwärzten Seitentexten
create index if not exists dokument_seiten_trgm on public.dokument_seiten using gin (lower(text) extensions.gin_trgm_ops);

-- Seitensuche: zuerst deutsche Volltextsuche (Wortanfänge), danach Trigramm für Wortteile („Diebstahl“ in „Einbruchdiebstahl“)
-- und Tippfehler der Texterkennung („Einbnuch“). Nur Wörter, die keine Stoppwörter sind. Höchstens 12 Seiten.
create or replace function public.seiten_suchen(p_haushalt uuid, p_frage text, p_max int default 12, p_dokumente uuid[] default null)
returns table (dokument_id uuid, nr int, text text, rang real)
language sql stable security invoker set search_path = '' as $$
  with roh as (
    select distinct w from regexp_split_to_table(lower(left(coalesce(p_frage, ''), 500)), '[^a-zäöüß]+') as w where length(w) >= 3
  ),
  woerter as (
    select distinct l.lexem, r.w from roh r, lateral unnest(to_tsvector('german', r.w)) as l(lexem, positions, weights)
  ),
  q as (
    select to_tsquery('simple', string_agg(quote_literal(lexem) || ':*', ' | ')) as tq from woerter
  ),
  basis as (
    select s.dokument_id, s.nr, s.text, s.suche, lower(s.text) as klein
    from public.dokument_seiten s
    join public.dokumente d on d.haushalt_id = s.haushalt_id and d.id = s.dokument_id
    where s.haushalt_id = p_haushalt and d.verworfen_am is null and (p_dokumente is null or s.dokument_id = any (p_dokumente))
  ),
  volltext as (
    select b.dokument_id, b.nr, b.text, 1 + ts_rank(b.suche, q.tq) as rang
    from basis b cross join q where q.tq is not null and b.suche @@ q.tq
  ),
  trigramm as (
    select b.dokument_id, b.nr, b.text,
           max(case when b.klein like '%' || w.w || '%' then 0.9 else extensions.word_similarity(w.w, b.klein) end)::real as rang
    from basis b cross join (select distinct w from woerter where length(w) >= 4) w
    where b.klein like '%' || w.w || '%' or extensions.word_similarity(w.w, b.klein) >= 0.7
    group by b.dokument_id, b.nr, b.text
  )
  select dokument_id, nr, text, max(rang)::real as rang
  from (select * from volltext union all select * from trigramm) x
  group by dokument_id, nr, text
  order by rang desc, dokument_id, nr
  limit least(greatest(coalesce(p_max, 12), 1), 12);
$$;

-- Normalform eines Dokumenttexts für Vergleiche: klein, Leerraum zusammengefasst
create or replace function privat.text_normal(p text) returns text language sql immutable set search_path = '' as $$
  select trim(regexp_replace(lower(coalesce(p, '')), '\s+', ' ', 'g'))
$$;
grant execute on function privat.text_normal(text) to authenticated;

-- Dubletten: vergleicht einen (geschwärzten) Text mit den gespeicherten Dokumenten des Haushalts.
-- gleich = identischer Text (nach Normalform); sonst Ähnlichkeit nach Trigrammen. Läuft mit den Rechten der Person (RLS).
create or replace function public.dokument_dubletten(p_haushalt uuid, p_text text, p_schwelle real default 0.6)
returns table (dokument_id uuid, titel text, typ text, datum date, aehnlichkeit real, gleich boolean)
language sql stable security invoker set search_path = '' as $$
  with neu as (select privat.text_normal(left(coalesce(p_text, ''), 200000)) as t),
  alt as (
    select d.id, d.titel, d.typ, d.datum, privat.text_normal(string_agg(s.text, ' ' order by s.nr)) as t
    from public.dokumente d join public.dokument_seiten s on s.haushalt_id = d.haushalt_id and s.dokument_id = d.id
    where d.haushalt_id = p_haushalt and d.verworfen_am is null
    group by d.id, d.titel, d.typ, d.datum
  )
  select a.id, a.titel, a.typ, a.datum, extensions.similarity(a.t, n.t) as aehnlichkeit, a.t = n.t as gleich
  from alt a cross join neu n
  where length(n.t) >= 20 and (a.t = n.t or extensions.similarity(a.t, n.t) >= p_schwelle)
  order by gleich desc, aehnlichkeit desc
  limit 3;
$$;
revoke all on function public.dokument_dubletten(uuid, text, real) from public, anon;
grant execute on function public.dokument_dubletten(uuid, text, real) to authenticated;

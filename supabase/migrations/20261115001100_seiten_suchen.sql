-- Frag die Akte, Schritt 1 ohne KI: passende Seiten per deutscher Volltextsuche.
-- Jedes Wort der Frage wird gestemmt und als Präfix gesucht („einbruch:*“ findet auch „Einbruchdiebstahl“),
-- Wörter mit ODER verknüpft, sortiert nach Rang. Läuft mit den Rechten der Person (RLS gilt), nur nicht verworfene Dokumente.
-- Grenze: Wortteile am Ende eines Kompositums („Diebstahl“ in „Einbruchdiebstahl“) werden nicht gefunden.
create or replace function public.seiten_suchen(p_haushalt uuid, p_frage text, p_max int default 12)
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
    and s.suche @@ q.tq
  order by rang desc, s.dokument_id, s.nr
  limit least(greatest(coalesce(p_max, 12), 1), 12);
$$;

revoke all on function public.seiten_suchen(uuid, text, int) from public, anon;
grant execute on function public.seiten_suchen(uuid, text, int) to authenticated;

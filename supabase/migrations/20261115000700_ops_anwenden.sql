-- Schreib-Schritte aus dem Regelmodul (ereignisFolgen, wartung, dingFolgen, lebensFolgen) in EINER Transaktion anwenden.
-- SECURITY INVOKER: RLS gilt für jede Zeile. Nur freigegebene Tabellen und Spalten.
-- p_ops: [{ "art": "neu" | "aendern" | "schluessel", "tabelle": "...", "id": uuid?, "schluessel": text?, "daten": { spalte: wert } }]
--   neu        → insert
--   aendern    → update ... where id = id (Zeile muss existieren)
--   schluessel → insert oder update über (haushalt_id, schluessel); für automatische, feste Einträge (z. B. auto_<vertrag>_ende)

create function public.ops_anwenden(p_haushalt_id uuid, p_ops jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  o jsonb;
  t text;
  a text;
  d jsonb;
  spalten text;
  verboten text;
  n int := 0;
  getroffen int;
  v_tabellen constant text[] := array['vertraege', 'fassungen', 'termine', 'ereignisse', 'dinge'];
begin
  if jsonb_typeof(p_ops) <> 'array' then
    raise exception 'ops muss eine Liste sein' using errcode = '22023';
  end if;
  for o in select * from jsonb_array_elements(p_ops) loop
    t := o ->> 'tabelle';
    a := o ->> 'art';
    d := coalesce(o -> 'daten', '{}'::jsonb);
    if t is null or t <> all (v_tabellen) then
      raise exception 'Tabelle nicht erlaubt: %', t using errcode = '22023';
    end if;
    if jsonb_typeof(d) <> 'object' then
      raise exception 'daten muss ein Objekt sein' using errcode = '22023';
    end if;
    -- nur echte Spalten der Tabelle, nie Schlüssel, Haushalt oder Zeitstempel
    select k into verboten from jsonb_object_keys(d) k
    where k in ('id', 'haushalt_id', 'erstellt_am', 'geaendert_am', 'verworfen_am', 'schluessel')
       or not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = k)
    limit 1;
    if verboten is not null then
      raise exception 'Spalte nicht erlaubt: %.%', t, verboten using errcode = '22023';
    end if;
    select string_agg(quote_ident(k), ', ' order by k) into spalten from jsonb_object_keys(d) k;

    if a = 'neu' then
      if spalten is null then raise exception 'neu ohne daten' using errcode = '22023'; end if;
      execute format('insert into public.%I (haushalt_id, %s) select $1, %s from jsonb_populate_record(null::public.%I, $2)', t, spalten, spalten, t)
        using p_haushalt_id, d;
    elsif a = 'aendern' then
      if spalten is null then continue; end if;
      execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2)) where id = $3 and haushalt_id = $1', t, spalten, spalten, t)
        using p_haushalt_id, d, (o ->> 'id')::uuid;
      get diagnostics getroffen = row_count;
      if getroffen <> 1 then
        raise exception 'Eintrag nicht gefunden: % %', t, o ->> 'id' using errcode = 'P0002';
      end if;
    elsif a = 'schluessel' then
      if t not in ('termine', 'ereignisse') or coalesce(o ->> 'schluessel', '') = '' then
        raise exception 'schluessel nur für termine/ereignisse' using errcode = '22023';
      end if;
      if spalten is null then raise exception 'schluessel ohne daten' using errcode = '22023'; end if;
      execute format('insert into public.%I (haushalt_id, schluessel, %s) select $1, $3, %s from jsonb_populate_record(null::public.%I, $2) '
        || 'on conflict (haushalt_id, schluessel) do update set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2))',
        t, spalten, spalten, t, spalten, spalten, t)
        using p_haushalt_id, d, o ->> 'schluessel';
    else
      raise exception 'unbekannte art: %', a using errcode = '22023';
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.ops_anwenden(uuid, jsonb) from public, anon;
grant execute on function public.ops_anwenden(uuid, jsonb) to authenticated;

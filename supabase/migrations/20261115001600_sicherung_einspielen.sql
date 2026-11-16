-- Datensicherung zurückspielen: ersetzt ALLE Daten eines Haushalts in EINER Transaktion (alles oder nichts).
-- Läuft mit den Rechten der Person (RLS): nur Mitglieder können löschen und einfügen.
-- Mitglieder, Push-Geräte, Kalender-Schlüssel und KI-Protokoll bleiben unberührt.
-- haushalt_id wird immer auf den Ziel-Haushalt gesetzt; Verweise auf Personen (erstellt_von, geaendert_von) werden geleert.
create function public.sicherung_einspielen(p_haushalt_id uuid, p_daten jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Lade-Reihenfolge (Eltern vor Kindern); gelöscht wird in umgekehrter Reihenfolge
  v_tabellen constant text[] := array['firmen', 'dinge', 'vertraege', 'vertrag_dinge', 'vertrag_rollen', 'dokumente', 'fassungen', 'belege',
    'schadenfaelle', 'termine', 'ereignisse', 'dokument_seiten', 'dokument_bilder', 'schaden_dinge', 'schaden_pruefungen', 'schaden_fotos',
    'fragen', 'schwaerzliste'];
  t text;
  i int;
  spalten text;
  werte text;
  n int;
  stand jsonb := '{}';
begin
  if not privat.ist_mitglied(p_haushalt_id) then
    raise exception 'Kein Zugriff auf diesen Haushalt' using errcode = '42501';
  end if;
  if jsonb_typeof(p_daten) <> 'object' then
    raise exception 'Daten müssen ein Objekt sein' using errcode = '22023';
  end if;

  for i in reverse array_length(v_tabellen, 1) .. 1 loop
    execute format('delete from public.%I where haushalt_id = $1', v_tabellen[i]) using p_haushalt_id;
  end loop;

  foreach t in array v_tabellen loop
    if jsonb_typeof(p_daten -> t) is distinct from 'array' or jsonb_array_length(p_daten -> t) = 0 then continue; end if;
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
           string_agg(case c.column_name when 'haushalt_id' then '$1' when 'erstellt_von' then 'null' when 'geaendert_von' then 'null'
                      else 'r.' || quote_ident(c.column_name) end, ', ' order by c.ordinal_position)
      into spalten, werte
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = t and c.is_generated = 'NEVER';
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $2) r', t, spalten, werte, t)
      using p_haushalt_id, p_daten -> t;
    get diagnostics n = row_count;
    stand := stand || jsonb_build_object(t, n);
  end loop;

  if jsonb_typeof(p_daten -> 'einstellungen') = 'object' then
    update public.haushalte set einstellungen = p_daten -> 'einstellungen' where id = p_haushalt_id;
  end if;
  return stand;
end;
$$;
revoke all on function public.sicherung_einspielen(uuid, jsonb) from public, anon;
grant execute on function public.sicherung_einspielen(uuid, jsonb) to authenticated;

-- Vertrag samt Bezügen (Dinge, Rollen) in einer Transaktion speichern.
-- SECURITY INVOKER: läuft mit den Rechten der angemeldeten Person, RLS gilt für jede Zeile.
-- p_id null = neu anlegen. p_daten enthält nur Spalten von public.vertraege (ohne id, haushalt_id, Zeitstempel).
-- Hauptbezug: erstes Element von p_dinge bzw. p_rollen.

create function public.vertrag_speichern(
  p_haushalt_id uuid,
  p_id uuid,
  p_daten jsonb,
  p_dinge uuid[] default '{}',
  p_rollen text[] default '{}'
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_erlaubt constant text[] := array['kurzname', 'art', 'firma_id', 'status', 'beitrag', 'zahlweise', 'laufzeitende', 'erstlaufzeit_ende',
    'frist_wert', 'frist_einheit', 'verlaengerung', 'abschluss', 'beginn', 'kuendigungsweg', 'online', 'gekuendigt_am', 'gekuendigt_zum',
    'bestaetigt', 'ersetzt_durch_id', 'notiz'];
  v_fremd text;
  v_zeile public.vertraege;
begin
  select k into v_fremd from jsonb_object_keys(p_daten) k where k <> all (v_erlaubt) limit 1;
  if v_fremd is not null then
    raise exception 'unbekanntes Feld: %', v_fremd using errcode = '22023';
  end if;
  if array_length(p_dinge, 1) <> (select count(distinct x) from unnest(p_dinge) x) or
     array_length(p_rollen, 1) <> (select count(distinct x) from unnest(p_rollen) x) then
    raise exception 'doppelter Bezug' using errcode = '22023';
  end if;

  if p_id is null then
    v_zeile := jsonb_populate_record(null::public.vertraege, p_daten || jsonb_build_object('haushalt_id', p_haushalt_id));
    insert into public.vertraege (haushalt_id, kurzname, art, firma_id, status, beitrag, zahlweise, laufzeitende, erstlaufzeit_ende,
      frist_wert, frist_einheit, verlaengerung, abschluss, beginn, kuendigungsweg, online, gekuendigt_am, gekuendigt_zum, bestaetigt,
      ersetzt_durch_id, notiz)
    values (p_haushalt_id, v_zeile.kurzname, v_zeile.art, v_zeile.firma_id, coalesce(v_zeile.status, 'aktiv'), v_zeile.beitrag,
      v_zeile.zahlweise, v_zeile.laufzeitende, v_zeile.erstlaufzeit_ende, v_zeile.frist_wert, v_zeile.frist_einheit, v_zeile.verlaengerung,
      v_zeile.abschluss, v_zeile.beginn, v_zeile.kuendigungsweg, coalesce(v_zeile.online, false), v_zeile.gekuendigt_am, v_zeile.gekuendigt_zum,
      coalesce(v_zeile.bestaetigt, false), v_zeile.ersetzt_durch_id, v_zeile.notiz)
    returning id into v_id;
  else
    select * into v_zeile from public.vertraege where id = p_id and haushalt_id = p_haushalt_id;
    if not found then
      raise exception 'Vertrag nicht gefunden' using errcode = 'P0002';
    end if;
    v_zeile := jsonb_populate_record(v_zeile, p_daten);
    update public.vertraege set
      kurzname = v_zeile.kurzname, art = v_zeile.art, firma_id = v_zeile.firma_id, status = v_zeile.status, beitrag = v_zeile.beitrag,
      zahlweise = v_zeile.zahlweise, laufzeitende = v_zeile.laufzeitende, erstlaufzeit_ende = v_zeile.erstlaufzeit_ende,
      frist_wert = v_zeile.frist_wert, frist_einheit = v_zeile.frist_einheit, verlaengerung = v_zeile.verlaengerung,
      abschluss = v_zeile.abschluss, beginn = v_zeile.beginn, kuendigungsweg = v_zeile.kuendigungsweg, online = coalesce(v_zeile.online, false),
      gekuendigt_am = v_zeile.gekuendigt_am, gekuendigt_zum = v_zeile.gekuendigt_zum, bestaetigt = coalesce(v_zeile.bestaetigt, false),
      ersetzt_durch_id = v_zeile.ersetzt_durch_id, notiz = v_zeile.notiz
    where id = p_id and haushalt_id = p_haushalt_id;
    v_id := p_id;
  end if;

  delete from public.vertrag_dinge where vertrag_id = v_id and haushalt_id = p_haushalt_id;
  insert into public.vertrag_dinge (haushalt_id, vertrag_id, ding_id, haupt)
    select p_haushalt_id, v_id, d, ord = 1 from unnest(p_dinge) with ordinality as t(d, ord);
  delete from public.vertrag_rollen where vertrag_id = v_id and haushalt_id = p_haushalt_id;
  insert into public.vertrag_rollen (haushalt_id, vertrag_id, rolle, haupt)
    select p_haushalt_id, v_id, r, ord = 1 from unnest(p_rollen) with ordinality as t(r, ord);
  return v_id;
end;
$$;

revoke all on function public.vertrag_speichern(uuid, uuid, jsonb, uuid[], text[]) from public, anon;
grant execute on function public.vertrag_speichern(uuid, uuid, jsonb, uuid[], text[]) to authenticated;

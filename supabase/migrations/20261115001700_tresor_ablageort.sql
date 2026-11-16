-- Nummern-Tresor und Ablageort (KONZEPT 13.1).
-- Tresor: ein verschlüsselter Block je Haushalt, mit demselben Schlüssel wie die Schwärzliste (gleiches Passwort, gleiches Salz).
-- Der Server sieht nur Datensalat; Nummern stehen nie im Klartext in der Datenbank und gehen nie an eine KI.
create table public.nummern_tresor (
  haushalt_id   uuid primary key references public.haushalte (id) on delete cascade,
  v             int not null default 1 check (v = 1),
  iv            text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  daten         text not null check (daten ~ '^[A-Za-z0-9+/]+={0,2}$' and length(daten) between 24 and 500000),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
alter table public.nummern_tresor enable row level security;
revoke all on public.nummern_tresor from anon;
create policy nummern_tresor_lesen on public.nummern_tresor for select to authenticated using (privat.ist_mitglied(haushalt_id));
create policy nummern_tresor_anlegen on public.nummern_tresor for insert to authenticated with check (privat.ist_mitglied(haushalt_id));
create policy nummern_tresor_aendern on public.nummern_tresor for update to authenticated using (privat.ist_mitglied(haushalt_id)) with check (privat.ist_mitglied(haushalt_id));
create policy nummern_tresor_loeschen on public.nummern_tresor for delete to authenticated using (privat.ist_mitglied(haushalt_id));

-- Ablageort des Originals: Freitext ohne sensible Daten (Prüfung im Browser wie bei Notizen)
alter table public.vertraege add column ablageort text check (length(ablageort) <= 200);
alter table public.dokumente add column ablageort text check (length(ablageort) <= 200);

-- dokument_speichern: Ablageort erlaubt
create or replace function public.dokument_speichern(p_haushalt_id uuid, p_dokument jsonb, p_seiten jsonb, p_bilder jsonb, p_ops jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d public.dokumente;
  v_fremd text;
  v_erlaubt constant text[] := array['id', 'typ', 'titel', 'datum', 'gueltig_von', 'gueltig_bis', 'vertrag_id', 'ding_id', 'firma_id', 'seiten', 'quelle', 'datenschutz', 'steckbrief', 'ablageort'];
begin
  select k into v_fremd from jsonb_object_keys(p_dokument) k where k <> all (v_erlaubt) limit 1;
  if v_fremd is not null then
    raise exception 'unbekanntes Feld: %', v_fremd using errcode = '22023';
  end if;
  if (p_dokument ->> 'id') is null then
    raise exception 'Dokument-ID fehlt' using errcode = '22023';
  end if;
  d := jsonb_populate_record(null::public.dokumente, p_dokument);
  insert into public.dokumente (id, haushalt_id, typ, titel, datum, gueltig_von, gueltig_bis, vertrag_id, ding_id, firma_id, seiten, quelle, datenschutz, steckbrief, ablageort)
  values (d.id, p_haushalt_id, d.typ, d.titel, d.datum, d.gueltig_von, d.gueltig_bis, d.vertrag_id, d.ding_id, d.firma_id,
    coalesce(d.seiten, 1), d.quelle, coalesce(d.datenschutz, '{}'::jsonb), d.steckbrief, d.ablageort);
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

-- Datensicherung zurückspielen: Tresor gehört dazu (verschlüsselt)
create or replace function public.sicherung_einspielen(p_haushalt_id uuid, p_daten jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Lade-Reihenfolge (Eltern vor Kindern); gelöscht wird in umgekehrter Reihenfolge
  v_tabellen constant text[] := array['firmen', 'dinge', 'vertraege', 'vertrag_dinge', 'vertrag_rollen', 'dokumente', 'fassungen', 'belege',
    'schadenfaelle', 'termine', 'ereignisse', 'dokument_seiten', 'dokument_bilder', 'schaden_dinge', 'schaden_pruefungen', 'schaden_fotos',
    'fragen', 'schwaerzliste', 'nummern_tresor'];
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

-- vertrag_speichern: Ablageort erlaubt
create or replace function public.vertrag_speichern(
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
    'bestaetigt', 'ersetzt_durch_id', 'notiz', 'ablageort'];
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
      ersetzt_durch_id, notiz, ablageort)
    values (p_haushalt_id, v_zeile.kurzname, v_zeile.art, v_zeile.firma_id, coalesce(v_zeile.status, 'aktiv'), v_zeile.beitrag,
      v_zeile.zahlweise, v_zeile.laufzeitende, v_zeile.erstlaufzeit_ende, v_zeile.frist_wert, v_zeile.frist_einheit, v_zeile.verlaengerung,
      v_zeile.abschluss, v_zeile.beginn, v_zeile.kuendigungsweg, coalesce(v_zeile.online, false), v_zeile.gekuendigt_am, v_zeile.gekuendigt_zum,
      coalesce(v_zeile.bestaetigt, false), v_zeile.ersetzt_durch_id, v_zeile.notiz, v_zeile.ablageort)
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
      ersetzt_durch_id = v_zeile.ersetzt_durch_id, notiz = v_zeile.notiz, ablageort = v_zeile.ablageort
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

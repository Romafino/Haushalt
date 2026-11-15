-- Termin als erledigt markieren; bei Wiederholung den nächsten Termin anlegen. Beides in einer Transaktion.
-- SECURITY INVOKER: RLS gilt. Monatsrechnung wie im Regelmodul (addMonths): 31.01. + 1 Monat = 28./29.02.
create function public.termin_erledigt(p_haushalt_id uuid, p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.termine;
  v_neu uuid;
begin
  update public.termine set status = 'erledigt'
  where id = p_id and haushalt_id = p_haushalt_id and not abgeleitet and status = 'offen'
  returning * into t;
  if not found then
    raise exception 'Termin nicht gefunden oder schon erledigt' using errcode = 'P0002';
  end if;
  if t.wiederholung_monate is not null and t.datum is not null then
    insert into public.termine (haushalt_id, titel, datum, notiz, vorlauf_tage, wiederholung_monate, status, quelle, vertrag_id, ding_id, beleg_id)
    values (t.haushalt_id, t.titel, (t.datum + make_interval(months => t.wiederholung_monate))::date, t.notiz, t.vorlauf_tage,
      t.wiederholung_monate, 'offen', t.quelle, t.vertrag_id, t.ding_id, t.beleg_id)
    returning id into v_neu;
  end if;
  return v_neu;
end;
$$;

revoke all on function public.termin_erledigt(uuid, uuid) from public, anon;
grant execute on function public.termin_erledigt(uuid, uuid) to authenticated;

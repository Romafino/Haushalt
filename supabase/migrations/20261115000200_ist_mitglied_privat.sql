-- ist_mitglied() aus der öffentlichen API nehmen (Supabase-Hinweis: SECURITY DEFINER über /rest/v1/rpc aufrufbar).
-- Die Funktion wandert in das nicht veröffentlichte Schema "privat". RLS-Regeln verweisen intern auf die Funktion
-- (nicht über den Namen) und gelten unverändert weiter. Nichts wird gelöscht.

create schema if not exists privat;
revoke all on schema privat from public;
revoke all on schema privat from anon;
-- angemeldete Nutzer brauchen USAGE, damit die RLS-Regeln die Funktion auswerten können
grant usage on schema privat to authenticated;

alter function public.ist_mitglied(uuid) set schema privat;

-- mitglied_hinzufuegen ruft die Funktion über den Namen auf: auf das neue Schema umstellen (sonst gleich).
create or replace function public.mitglied_hinzufuegen(p_haushalt_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neu uuid;
begin
  if not privat.ist_mitglied(p_haushalt_id) then
    raise exception 'kein Zugriff' using errcode = '42501';
  end if;
  select u.id into v_neu from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_neu is null then
    return false;
  end if;
  insert into public.mitglieder (haushalt_id, nutzer_id)
  values (p_haushalt_id, v_neu)
  on conflict do nothing;
  return true;
end;
$$;

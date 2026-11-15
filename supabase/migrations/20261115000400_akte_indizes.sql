-- Indizes für Verweise der Bezugstabellen (Supabase-Hinweis „unindexed foreign keys“).
create index if not exists vertrag_dinge_haushalt_vertrag_idx on public.vertrag_dinge (haushalt_id, vertrag_id);
create index if not exists vertrag_rollen_haushalt_vertrag_idx on public.vertrag_rollen (haushalt_id, vertrag_id);

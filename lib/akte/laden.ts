/* Lädt die Akte eines Haushalts mit der Anmeldung der Person (RLS schützt) und bildet sie für das Regelmodul ab. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { akteAus, type Akte, type Rohdaten } from './abbilden';

const TABELLEN = ['firmen', 'dinge', 'vertraege', 'vertrag_dinge', 'vertrag_rollen', 'fassungen', 'belege', 'termine', 'ereignisse'] as const;
const MIT_VERWERFEN = new Set(['firmen', 'dinge', 'vertraege', 'fassungen', 'belege', 'termine', 'ereignisse']);

export async function ladeAkte(supabase: SupabaseClient, haushaltId: string): Promise<Akte> {
  const [haushalt, ...teile] = await Promise.all([
    supabase.from('haushalte').select('einstellungen').eq('id', haushaltId).single(),
    ...TABELLEN.map((t) => {
      let q = supabase.from(t).select('*').eq('haushalt_id', haushaltId);
      if (MIT_VERWERFEN.has(t)) q = q.is('verworfen_am', null);
      return q;
    }),
  ]);
  const fehler = [haushalt, ...teile].find((x) => x.error);
  if (fehler?.error) throw new Error('Akte konnte nicht geladen werden: ' + fehler.error.message);
  const roh = { haushalt: haushalt.data } as Rohdaten;
  TABELLEN.forEach((t, i) => { (roh as Record<string, unknown>)[t] = teile[i].data ?? []; });
  return akteAus(roh);
}

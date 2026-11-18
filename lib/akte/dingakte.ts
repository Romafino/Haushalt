/* Mini-Akte eines Dings (18.11.2026): alles, was daran hängt, auf einen Blick. Reines Modul.
   Verträge (Haupt- und weitere Bezüge), Dokumente (am Ding oder an einem seiner Verträge), Belege, offene Termine, Kosten pro Jahr. */
import * as R from '@/lib/regeln';
import type { Akte, Eintrag } from './abbilden';

export type Termin = { id: string; datum: string | null; titel: string; vertragId?: string; dingId?: string; belegId?: string; ueberfaellig: boolean };
export type DingAkte = {
  vertraege: Eintrag[]; dokumente: Eintrag[]; belege: Eintrag[]; termine: Termin[];
  kosten: { vertraegeJahr: number; belege12Monate: number };
};

export function dingAkte(S: Akte, dingId: string, heute: string): DingAkte {
  const vertraege = S.vertraege.filter((v) => R.dingeVon(v).includes(dingId))
    .sort((a, b) => Number(R.laeuft(b)) - Number(R.laeuft(a)) || String(a.kurzname).localeCompare(String(b.kurzname), 'de'));
  const vIds = new Set(vertraege.map((v) => v.id));
  const belege = S.belege.filter((b) => b.dingId === dingId).sort((a, b) => String(b.datum ?? '').localeCompare(String(a.datum ?? '')));
  const bIds = new Set(belege.map((b) => b.id));
  const dokumente = S.dokumente.filter((d) => d.dingId === dingId || (typeof d.vertragId === 'string' && vIds.has(d.vertragId)))
    .sort((a, b) => String(b.datum ?? '').localeCompare(String(a.datum ?? '')));
  const termine = (R.alleFristen(S, heute) as { id: string; datum: string | null; titel: string; erledigt: boolean; vertragId?: string; dingId?: string; belegId?: string }[])
    .filter((f) => !f.erledigt && (f.dingId === dingId || (!!f.vertragId && vIds.has(f.vertragId)) || (!!f.belegId && bIds.has(f.belegId))))
    .map((f) => ({ id: f.id, datum: f.datum, titel: f.titel, vertragId: f.vertragId, dingId: f.dingId, belegId: f.belegId, ueberfaellig: !!f.datum && f.datum < heute }));
  const vertraegeJahr = Math.round(vertraege.filter(R.laeuft).reduce((s, v) => s + R.proMonat(R.standAm(v, S.fassungen, heute)) * 12, 0) * 100) / 100;
  const ab = R.addMonths(heute, -12);
  const belege12Monate = Math.round(belege.filter((b) => typeof b.datum === 'string' && b.datum > ab && b.datum <= heute).reduce((s, b) => s + (Number(b.betrag) || 0), 0) * 100) / 100;
  return { vertraege, dokumente, belege, termine, kosten: { vertraegeJahr, belege12Monate } };
}

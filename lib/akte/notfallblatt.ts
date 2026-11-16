/* Notfallblatt (KONZEPT 13.2): laufende Verträge mit Anbieter, Hotline, Ablageort des Originals und nächster Frist,
   dazu die nächsten Fristen und Sofortmaßnahmen. Grundlage ist notfallDaten() aus dem Regelmodul (ohne Beträge, Namen, Nummern).
   Nummern kommen nur auf dem entsperrten Gerät dazu (Parameter nummern). Reines Modul. */
import * as R from '@/lib/regeln';
import type { Akte } from './abbilden';
import type { Tresor } from '@/lib/schwaerzen/tresor';

type Zeile = { id: string; name: string; firma: string; hotline: string; fuerWen: string; bezug: string; ablageort: string; frist: { titel: string; datum: string } | null; nummern: string[] };
export type Notfallblatt = { stand: string; sofort: string[]; versicherungen: Zeile[]; vertraege: Zeile[]; firmen: { name: string; art: string; hotline: string }[]; fristen: { titel: string; datum: string }[] };

export function notfallblatt(S: Akte, heute: string, nummern?: Tresor): Notfallblatt {
  const n = R.notfallDaten(S, S.einst, heute);
  const offen = (R.alleFristen(S, heute) as { titel: string; datum?: string | null; erledigt?: boolean; vertragId?: string }[])
    .filter((f) => !f.erledigt && f.datum && f.datum >= heute) as { titel: string; datum: string; vertragId?: string }[];
  const lfd = S.vertraege.filter((v) => R.laeuft(v));
  const zeile = (z: Record<string, string>, istVers: boolean): Zeile => {
    const v = lfd.find((x) => x.kurzname === z.name && !!R.istVers(x) === istVers && (S.firmen.find((f) => f.id === x.firmaId)?.name ?? '') === z.firma);
    const f = v ? offen.find((x) => x.vertragId === v.id) : undefined;
    return {
      id: v?.id ?? '', name: z.name, firma: z.firma, hotline: z.hotline, fuerWen: z.fuerWen, bezug: z.bezug, ablageort: String(v?.ablageort ?? ''),
      frist: f ? { titel: f.titel, datum: f.datum } : null,
      nummern: v && nummern?.[v.id] ? nummern[v.id].map((x) => `${x.art}: ${x.nummer}`) : [],
    };
  };
  return {
    stand: heute, sofort: n.sofort,
    versicherungen: n.versicherungen.map((z: Record<string, string>) => zeile(z, true)),
    vertraege: n.vertraege.map((z: Record<string, string>) => zeile(z, false)),
    firmen: n.firmen,
    fristen: offen.slice(0, 10).map((f) => ({ titel: f.titel, datum: f.datum })),
  };
}

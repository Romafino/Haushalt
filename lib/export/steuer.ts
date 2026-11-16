/* Steuerexport §35a (KONZEPT 13.4): je Steuerjahr alle §35a-Belege mit Markierungen und Summen je Art, für PDF und Excel.
   Rechnet über steuer35a() aus dem Regelmodul. Keine Steuerberatung: nur Aufstellung, Hinweise ohne Gewähr. Reines Modul. */
import * as R from '@/lib/regeln';
import { REGELN, standText } from '@/lib/regeln/stand';
import type { Akte } from '@/lib/akte/abbilden';
import type { Block } from './pdf';
import type { Blatt } from './xlsx';

export const ART: Record<string, string> = { handwerker: 'Handwerkerleistung', haushaltsnah: 'Haushaltsnahe Dienstleistung' };

export type SteuerZeile = { datum: string; firma: string; leistung: string; art: string; betrag: number | null; arbeitskosten: number | null; unbar: boolean; hinweise: string[] };
export type SteuerSumme = { art: string; anzahl: number; arbeit: number; anrechenbar: number; ohneUnbar: number; rechnerisch: number; hoechst: number; prozent: number };

export function steuerJahre(S: Akte): string[] {
  return Array.from(new Set(S.belege.filter((b) => ART[String(b.steuer)] && b.datum).map((b) => String(b.datum).slice(0, 4)))).sort().reverse();
}

export function steuerListe(S: Akte, jahr: string): { zeilen: SteuerZeile[]; summen: SteuerSumme[] } {
  const zeilen = S.belege
    .filter((b) => ART[String(b.steuer)] && String(b.datum ?? '').slice(0, 4) === jahr)
    .sort((a, b) => String(a.datum).localeCompare(String(b.datum)))
    .map((b) => {
      const ak = Number(b.arbeitskosten) || 0;
      const hinweise = [!b.unbar ? 'nicht als unbar bezahlt markiert' : '', !ak ? 'keine Arbeitskosten ausgewiesen' : ''].filter(Boolean);
      return {
        datum: String(b.datum), firma: String(S.firmen.find((f) => f.id === b.firmaId)?.name ?? ''), leistung: String(b.titel ?? ''), art: ART[String(b.steuer)],
        betrag: Number(b.betrag) || null, arbeitskosten: ak || null, unbar: !!b.unbar, hinweise,
      };
    });
  const s = R.steuer35a(S.belege, jahr) as Record<string, { anzahl: number; arbeit: number; anrechenbar: number; bar: number; ermaessigung: number }>;
  const summen = Object.entries(s).filter(([, x]) => x.anzahl > 0).map(([k, x]) => ({
    art: ART[k] ?? k, anzahl: x.anzahl, arbeit: x.arbeit, anrechenbar: x.anrechenbar, ohneUnbar: x.bar, rechnerisch: Math.round(x.ermaessigung * 100) / 100, hoechst: (R.regel35a(jahr).max as Record<string, number>)[k], prozent: (R.regel35a(jahr).prozent as Record<string, number>)[k],
  }));
  return { zeilen, summen };
}

const euro = (n: number | null) => (n == null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));
const fmt = (iso: string) => iso.split('-').reverse().join('.');
export const HINWEIS = 'Aufstellung aus den Einträgen der App, ohne Gewähr und keine Steuerberatung. Berücksichtigt werden nur ausgewiesene Arbeits-, Fahrt- und Maschinenkosten, die unbar bezahlt wurden. Zugeordnet ist nach dem Datum des Belegs; maßgeblich ist das Jahr der Zahlung [prüfen]. Prozentsatz und Höchstbeträge nach Stand der Regel in der App (' + standText(REGELN.steuer35a) + ') [prüfen].';

export function steuerBloecke(jahr: string, l: ReturnType<typeof steuerListe>): Block[] {
  const b: Block[] = [{ art: 'titel', text: `§35a-Belege ${jahr}` }, { art: 'klein', text: HINWEIS }];
  for (const a of Object.values(ART)) {
    const zeilen = l.zeilen.filter((z) => z.art === a);
    if (!zeilen.length) continue;
    b.push({ art: 'h', text: a });
    for (const z of zeilen) {
      b.push({ art: 'text', text: `${fmt(z.datum)} – ${z.firma || 'ohne Firma'} – ${z.leistung}` });
      b.push({ art: 'klein', text: [`Arbeitskosten ${euro(z.arbeitskosten)}`, `Rechnung ${euro(z.betrag)}`, z.unbar ? 'unbar bezahlt' : '', ...z.hinweise.map((h) => 'Achtung: ' + h)].filter(Boolean).join(' · ') });
    }
    const s = l.summen.find((x) => x.art === a);
    if (s) b.push({ art: 'text', text: `Summe: ${s.anzahl} Beleg(e), Arbeitskosten ${euro(s.arbeit)}, davon unbar ${euro(s.anrechenbar)} · rechnerisch ${s.prozent} %: ${euro(s.rechnerisch)} (Höchstbetrag ${euro(s.hoechst)})` });
  }
  return b;
}

export function steuerBlaetter(jahr: string, l: ReturnType<typeof steuerListe>): Blatt[] {
  return [
    { name: `Belege ${jahr}`, zeilen: l.zeilen.map((z) => ({ Datum: fmt(z.datum), Firma: z.firma, Leistung: z.leistung, Art: z.art, Arbeitskosten: z.arbeitskosten, Rechnungsbetrag: z.betrag, 'Unbar bezahlt': z.unbar ? 'ja' : 'nein', Hinweis: z.hinweise.join('; ') })) },
    { name: `Summen ${jahr}`, zeilen: [...l.summen.map((s) => ({ Art: s.art, Belege: s.anzahl, Arbeitskosten: s.arbeit, 'davon unbar': s.anrechenbar, 'Belege nicht unbar': s.ohneUnbar, 'Prozent': s.prozent, 'rechnerisch': s.rechnerisch, Höchstbetrag: s.hoechst })), { Art: HINWEIS }] },
  ];
}

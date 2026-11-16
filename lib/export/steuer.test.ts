/* Steuerexport §35a: Auswahl je Jahr, Markierungen, Summen, PDF/Excel-Inhalt. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { steuerBlaetter, steuerBloecke, steuerJahre, steuerListe } from './steuer';
import type { Akte } from '@/lib/akte/abbilden';

const S = {
  firmen: [{ id: 'f1', name: 'Beispiel Sanitär GmbH' }, { id: 'f2', name: 'Muster Gartenpflege' }],
  belege: [
    { id: 'b1', titel: 'Heizungswartung', datum: '2026-05-10', firmaId: 'f1', betrag: 320, arbeitskosten: 210, steuer: 'handwerker', unbar: true },
    { id: 'b2', titel: 'Rohrreparatur', datum: '2026-08-01', firmaId: 'f1', betrag: 150, arbeitskosten: 90, steuer: 'handwerker', unbar: false },
    { id: 'b3', titel: 'Gartenpflege', datum: '2026-09-15', firmaId: 'f2', betrag: 400, steuer: 'haushaltsnah', unbar: true },
    { id: 'b4', titel: 'Fenster', datum: '2025-03-01', firmaId: 'f1', betrag: 900, arbeitskosten: 500, steuer: 'handwerker', unbar: true },
    { id: 'b5', titel: 'Fernseher', datum: '2026-02-01', betrag: 800, steuer: '-' },
  ],
  vertraege: [], dinge: [], fristen: [], ereignisse: [], dokumente: [], fassungen: [], schadenfaelle: [], zaehler: [], einst: {},
} as unknown as Akte;

describe('Steuerexport §35a', () => {
  it('Jahre mit §35a-Belegen, neueste zuerst', () => {
    expect(steuerJahre(S)).toEqual(['2026', '2025']);
  });
  it('Liste je Jahr mit Markierungen; Summen nur unbar', () => {
    const l = steuerListe(S, '2026');
    expect(l.zeilen.map((z) => z.leistung)).toEqual(['Heizungswartung', 'Rohrreparatur', 'Gartenpflege']);
    expect(l.zeilen[1].hinweise).toEqual(['nicht als unbar bezahlt markiert']);
    expect(l.zeilen[2].hinweise).toEqual(['keine Arbeitskosten ausgewiesen']);
    const h = l.summen.find((s) => s.art === 'Handwerkerleistung')!;
    expect(h).toMatchObject({ anzahl: 2, arbeit: 300, anrechenbar: 210, ohneUnbar: 1, rechnerisch: 42, hoechst: 1200 });
  });
  it('PDF-Blöcke und Excel-Blätter enthalten Hinweis „keine Steuerberatung“ und Summen', () => {
    const l = steuerListe(S, '2026');
    const t = JSON.stringify(steuerBloecke('2026', l));
    expect(t).toContain('keine Steuerberatung');
    expect(t).toContain('Beispiel Sanitär GmbH');
    expect(t).toContain('davon unbar 210,00');
    const b = steuerBlaetter('2026', l);
    expect(b.map((x) => x.name)).toEqual(['Belege 2026', 'Summen 2026']);
    expect(b[0].zeilen[0]).toMatchObject({ Datum: '10.05.2026', Arbeitskosten: 210, 'Unbar bezahlt': 'ja' });
  });
});

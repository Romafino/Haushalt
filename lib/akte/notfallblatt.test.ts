/* Notfallblatt: Inhalt, ohne Beträge und Nummern, Nummern nur auf Wunsch. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { notfallblatt } from './notfallblatt';
import type { Akte } from './abbilden';

const H = '2026-11-16';
const S = {
  firmen: [{ id: 'f1', name: 'Beispiel Versicherung AG', hotline: '0800 111 2222' }, { id: 'f2', name: 'Stadtwerke Musterstadt', telefon: '0123 456789' }],
  vertraege: [
    { id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', firmaId: 'f1', status: 'aktiv', beitrag: 120, zahlweise: 'jaehrlich', laufzeitende: '2027-03-31', fristWert: 3, fristEinheit: 'Monate', ablageort: 'Ordner Versicherungen, Fach 3' },
    { id: 'v2', kurzname: 'Strom', art: 'Strom/Gas', firmaId: 'f2', status: 'aktiv', beitrag: 80, zahlweise: 'monatlich' },
    { id: 'v3', kurzname: 'Alt', art: 'Versicherung', firmaId: 'f1', status: 'beendet' },
  ],
  dinge: [], belege: [], fristen: [{ id: 't1', titel: 'Heizung warten', datum: '2026-12-01', manuell: true }], ereignisse: [], dokumente: [], fassungen: [], schadenfaelle: [], zaehler: [], einst: {},
} as unknown as Akte;

describe('Notfallblatt', () => {
  it('laufende Verträge mit Hotline, Ablageort und nächster Frist; Beendete fehlen', () => {
    const n = notfallblatt(S, H);
    expect(n.versicherungen).toHaveLength(1);
    expect(n.versicherungen[0]).toMatchObject({ name: 'Hausrat', firma: 'Beispiel Versicherung AG', hotline: '0800 111 2222', ablageort: 'Ordner Versicherungen, Fach 3', nummern: [] });
    expect(n.versicherungen[0].frist?.titel).toContain('Hausrat');
    expect(n.vertraege.map((v) => v.name)).toEqual(['Strom']);
    expect(n.fristen.map((f) => f.titel)).toContain('Heizung warten');
    expect(n.sofort.length).toBeGreaterThan(0);
  });
  it('keine Beträge; Nummern nur, wenn übergeben', () => {
    expect(JSON.stringify(notfallblatt(S, H))).not.toMatch(/120|80,|Kundennummer/);
    const mit = notfallblatt(S, H, { v1: [{ art: 'Versicherungsnummer', nummer: 'HR-7120 6680' }] });
    expect(mit.versicherungen[0].nummern).toEqual(['Versicherungsnummer: HR-7120 6680']);
  });
});

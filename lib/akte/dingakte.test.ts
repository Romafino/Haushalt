/* Mini-Akte eines Dings. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { dingAkte } from './dingakte';
import type { Akte } from './abbilden';

const H = '2026-11-18';
const S = {
  firmen: [], einst: {}, schadenfaelle: [], zaehler: [], ereignisse: [], fassungen: [],
  dinge: [{ id: 'auto', name: 'Kombi', kategorie: 'Auto' }, { id: 'haus', name: 'Haus', kategorie: 'Haus' }],
  vertraege: [
    { id: 'lea', kurzname: 'Leasing', art: 'Leasing', status: 'aktiv', beitrag: 300, zahlweise: 'monatlich', dingId: 'auto' },
    { id: 'kfz', kurzname: 'Kfz-Versicherung', art: 'Versicherung', status: 'aktiv', beitrag: 600, zahlweise: 'jaehrlich', dingId: 'auto' },
    { id: 'alt', kurzname: 'Kfz alt', art: 'Versicherung', status: 'beendet', beitrag: 500, zahlweise: 'jaehrlich', dingId: 'auto' },
    { id: 'geb', kurzname: 'Gebäude', art: 'Versicherung', status: 'aktiv', beitrag: 400, zahlweise: 'jaehrlich', dingId: 'haus', weitereDingIds: ['auto'] },
    { id: 'strom', kurzname: 'Strom', art: 'Strom/Gas', status: 'aktiv', beitrag: 90, zahlweise: 'monatlich', dingId: 'haus' }],
  belege: [
    { id: 'b1', titel: 'Inspektion', datum: '2026-05-10', betrag: 420, dingId: 'auto' },
    { id: 'b2', titel: 'Reifen', datum: '2025-03-01', betrag: 600, dingId: 'auto' },
    { id: 'b3', titel: 'Heizung', datum: '2026-06-01', betrag: 900, dingId: 'haus' }],
  fristen: [
    { id: 't1', titel: 'Hauptuntersuchung (TÜV) – Kombi', datum: '2027-03-01', status: 'offen', dingId: 'auto' },
    { id: 't2', titel: 'Erledigt', datum: '2026-01-01', status: 'erledigt', dingId: 'auto' },
    { id: 't3', titel: 'Schornsteinfeger', datum: '2027-01-01', status: 'offen', dingId: 'haus' }],
  dokumente: [
    { id: 'd1', titel: 'Fahrzeugschein', datum: '2024-01-01', dingId: 'auto' },
    { id: 'd2', titel: 'Kfz-Police', datum: '2026-01-01', vertragId: 'kfz' },
    { id: 'd3', titel: 'Stromvertrag', datum: '2026-01-01', vertragId: 'strom' }],
} as unknown as Akte;

describe('dingAkte', () => {
  const a = dingAkte(S, 'auto', H);
  it('Verträge mit Haupt- und weiterem Bezug, laufende zuerst', () => {
    expect(a.vertraege.map((v) => v.id)).toEqual(['geb', 'kfz', 'lea', 'alt']);
  });
  it('Dokumente am Ding und an seinen Verträgen, neueste zuerst', () => {
    expect(a.dokumente.map((d) => d.id)).toEqual(['d2', 'd1']);
  });
  it('Belege des Dings, offene Termine des Dings', () => {
    expect(a.belege.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(a.termine.map((t) => t.id)).toContain('t1');
    expect(a.termine.map((t) => t.id)).not.toContain('t2');
    expect(a.termine.map((t) => t.id)).not.toContain('t3');
  });
  it('Kosten: laufende Verträge pro Jahr, Belege der letzten 12 Monate', () => {
    expect(a.kosten).toEqual({ vertraegeJahr: 300 * 12 + 600 + 400, belege12Monate: 420 });
  });
});

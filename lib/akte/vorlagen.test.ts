import { describe, expect, it } from 'vitest';
import { naechstesDatum, VORLAGEN, vorlagenTitel } from './vorlagen';

describe('Terminvorlagen', () => {
  it('fünf Vorlagen mit Rhythmus und Hinweis', () => {
    expect(VORLAGEN.map((v) => v.schluessel)).toEqual(['hu', 'heizung', 'schornstein', 'rauchmelder', 'reifen']);
    expect(VORLAGEN.every((v) => v.monate >= 1 && v.hinweis.length > 10)).toBe(true);
  });
  it('nächstes Datum: letztes + Rhythmus, Vergangenes wird fortgeschrieben, Monatsende bleibt gültig', () => {
    expect(naechstesDatum('2026-03-15', 24, '2026-11-16')).toBe('2028-03-15');
    expect(naechstesDatum('2023-10-01', 6, '2026-11-16')).toBe('2027-04-01');
    expect(naechstesDatum('2026-08-31', 6, '2026-11-16')).toBe('2027-02-28');
    expect(() => naechstesDatum('15.03.2026', 12, '2026-11-16')).toThrow();
  });
  it('Titel mit Ding', () => {
    expect(vorlagenTitel(VORLAGEN[0], 'Familienauto')).toBe('Hauptuntersuchung (TÜV) – Familienauto');
  });
});

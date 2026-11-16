/* Stand der Fachregeln: Vollständigkeit, §35a je Steuerjahr, veraltete Prüfung. */
import { describe, expect, it } from 'vitest';
import { FASSUNGEN_35A, REGELN, regel35a, standText, veraltet } from './stand';
import { steuer35a } from './logik';

describe('Stand der Fachregeln', () => {
  it('jede Regel hat Inhalt, Grundlage, gilt ab, geprüft am und Quelle', () => {
    for (const [k, r] of Object.entries(REGELN)) {
      expect(r.inhalt.length, k).toBeGreaterThan(20);
      expect(r.grundlage.length, k).toBeGreaterThan(3);
      expect(r.giltAb, k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.geprueftAm, k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.quellen.length, k).toBeGreaterThan(0);
    }
    expect(standText(REGELN.steuer35a)).toBe('Stand 11/2026');
  });

  it('§35a: Werte je Steuerjahr; eine spätere Fassung ändert alte Jahre nicht', () => {
    expect(regel35a(2026)).toMatchObject({ max: { handwerker: 1200, haushaltsnah: 4000 } });
    const belege = [{ steuer: 'handwerker', datum: '2026-05-01', arbeitskosten: 10000, unbar: true }, { steuer: 'handwerker', datum: '2027-05-01', arbeitskosten: 10000, unbar: true }];
    expect(steuer35a(belege, 2026).handwerker.ermaessigung).toBe(1200);
    // gedachte neue Fassung ab 2027 (nur im Test): 2026 bleibt bei 1.200 €
    FASSUNGEN_35A.push({ giltAb: '2027', prozent: { handwerker: 15, haushaltsnah: 20 }, max: { handwerker: 900, haushaltsnah: 4000 } });
    try {
      expect(steuer35a(belege, 2026).handwerker.ermaessigung).toBe(1200);
      expect(steuer35a(belege, 2027).handwerker.ermaessigung).toBe(900);
    } finally { FASSUNGEN_35A.pop(); }
  });

  it('veraltet: Prüfung älter als ein Jahr', () => {
    expect(veraltet('2026-11-16')).toEqual([]);
    expect(veraltet('2027-11-17')).toEqual(Object.keys(REGELN));
  });
});

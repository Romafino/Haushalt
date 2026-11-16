/* KI-Module: Prompt, Antwort lesen, Kosten/Limit. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { dokumentPrompt, kurzakte, seitenInGrenze } from './prompt';
import { jsonAus, klartextVerdacht, vorschlagAus } from './antwort';
import { kostenCent, limitstand, preisAus } from './kosten';

describe('Prompt', () => {
  it('enthält Regeln, erlaubte Werte, Kurzakte und Text; keine Notizen oder Beträge der Akte', () => {
    const S = { firmen: [{ id: 'f1', name: 'Beispiel AG', notiz: 'geheim' }], vertraege: [{ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', status: 'aktiv', beitrag: 120, notiz: 'privat' }], dinge: [] };
    const p = dokumentPrompt([{ nr: 1, text: 'Police für [Vater]' }], kurzakte(S), '2026-11-15', 1);
    expect(p).toContain('Keine Beratung');
    expect(p).toContain('geschwärzte Seitenbild');
    expect(p).toContain('"kurzname":"Hausrat"');
    expect(p).toContain('=== Seite 1 ===\nPolice für [Vater]');
    expect(p).not.toMatch(/geheim|notiz|"beitrag":120/);
  });
  it('kürzt sehr lange Texte und sagt das dazu; 150 dichte Seiten passen', () => {
    const seite = (nr: number) => ({ nr, text: 'x'.repeat(3900) });
    expect(seitenInGrenze(Array.from({ length: 150 }, (_, i) => seite(i + 1)))).toBe(150);
    const lang = Array.from({ length: 200 }, (_, i) => seite(i + 1));
    const n = seitenInGrenze(lang);
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(200);
    const p = dokumentPrompt(lang, { firmen: [], vertraege: [], dinge: [] }, '2026-11-15', 0);
    expect(p).toContain('Der Text ist gekürzt');
    expect(p).toContain(`=== Seite ${n} ===`);
    expect(p).not.toContain(`=== Seite ${n + 1} ===`);
    expect(dokumentPrompt([seite(1)], { firmen: [], vertraege: [], dinge: [] }, '2026-11-15', 0)).not.toContain('gekürzt');
  });
});

describe('Antwort lesen', () => {
  it('JSON auch mit Code-Zaun oder Vorsatz', () => {
    expect(jsonAus('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(jsonAus('Hier ist das Ergebnis: {"a":2} Viel Erfolg')).toEqual({ a: 2 });
    expect(jsonAus('kein json')).toBeNull();
  });
  it('bereinigt: unbekannte Werte, fremde IDs, Nummernfelder im Steckbrief; Nummern in Texten werden geschwärzt, Summen bleiben', () => {
    const roh = {
      dokument: { typ: 'Police', titel: 'Hausrat Police 71206680', datum: '2026-01-15', gueltigVon: 'ab Januar' },
      vertrag: { kurzname: 'Hausrat', art: 'Versicherung', beitrag: 120, zahlweise: 'jährlich', fristWert: 3, fristEinheit: 'Monate' },
      bezug: { vertragId: 'fremd', dingId: null, firmaId: 'f1' },
      steckbrief: { gefahren: ['Feuer'], summen: [{ was: 'Hausrat', betrag: '65.000 €' }], versicherungsnummer: '123', selbstbeteiligung: '150 €' },
    };
    const v = vorschlagAus(roh, { vertraege: ['v1'], dinge: [], firmen: ['f1'] });
    expect(v.dokument).toEqual({ typ: 'Police', titel: 'Hausrat Police [Nummer]', datum: '2026-01-15' });
    expect(v.vertrag.zahlweise).toBeUndefined(); // „jährlich“ ist kein erlaubter Wert
    expect(v.bezug).toEqual({ vertragId: null, dingId: null, firmaId: 'f1' });
    expect(v.steckbrief).toEqual({ gefahren: ['Feuer'], summen: [{ was: 'Hausrat', betrag: '65.000 €' }], selbstbeteiligung: '150 €' });
  });
  it('Klartext-Sperre: IBAN oder lange Nummer im eingehenden Text', () => {
    expect(klartextVerdacht(['Beitrag 120,00 €, gültig ab 01.01.2026', 'Summe 65.000 €'])).toBe(false);
    expect(klartextVerdacht(['IBAN DE89 3704 0044 0532 0130 00'])).toBe(true);
    expect(klartextVerdacht(['Vertrag 71206680'])).toBe(true);
  });
});

describe('Kosten und Limit', () => {
  it('Cent aus Tokens; Denk-Tokens zählen wie Ausgabe', () => {
    expect(kostenCent({ ein: 10000, aus: 2000 }, { ein: 1.5, aus: 9 })).toBe(3.3);
    expect(kostenCent({ ein: 10000, aus: 2000, denken: 1000 }, { ein: 1.5, aus: 9 })).toBe(4.2);
  });
  it('Preise aus Umgebung, sonst vorsichtige Standardwerte', () => {
    expect(preisAus({ KI_PREIS_EIN: '0.75', KI_PREIS_AUS: '3.75' })).toEqual({ ein: 0.75, aus: 3.75 });
    expect(preisAus({ KI_PREIS_EIN: 'abc' })).toEqual({ ein: 1.5, aus: 9 });
  });
  it('Limit 10 €, Warnung ab 80 %', () => {
    expect(limitstand(799, {})).toMatchObject({ gesperrt: false, warnung: false, limitCent: 1000 });
    expect(limitstand(800, {})).toMatchObject({ gesperrt: false, warnung: true });
    expect(limitstand(1000, {})).toMatchObject({ gesperrt: true });
    expect(limitstand(300, { kiLimitEuro: 3 })).toMatchObject({ gesperrt: true });
  });
});

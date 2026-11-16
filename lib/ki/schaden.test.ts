/* Schadenprüfung je Police: Prompt-Regeln und Absicherung der Antwort. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { pruefungAus, schadenPrompt } from './schaden';

const police = { vertragId: 'v1', kurzname: 'Hausrat', firma: 'Beispiel Versicherung AG', hotline: '0800 111 2222', steckbrief: { gefahren: ['Leitungswasser'] }, steckbriefVon: '2026-01-01', fassungVon: null, dokumentId: 'd1', dokument: 'Police' };

describe('Schadenprüfung', () => {
  it('Prompt: eine Police, „nicht gefunden heißt unklar“, keine Beratung, Seiten mit Fundstelle', () => {
    const p = schadenPrompt({ datum: '2026-11-10', beschreibung: 'Leitung im Keller geplatzt', dinge: ['Waschmaschine'] }, { kurzname: 'Hausrat', steckbrief: police.steckbrief, seiten: [{ titel: 'Bedingungen', nr: 3, text: '§ 4 Leitungswasser' }] });
    expect(p).toContain('EINE ihrer Versicherungen');
    expect(p).toContain('Nicht gefunden heißt unklar, nie nein');
    expect(p).toContain('keine Aussage zur Höhe einer Zahlung');
    expect(p).toContain('=== „Bedingungen“, Seite 3 ===');
    expect(p).toContain('Waschmaschine');
  });

  it('„nein“ ohne Fundstelle oder Ausschluss wird „unklar“; mit Ausschluss bleibt „nein“', () => {
    expect(pruefungAus(police, { greift: 'nein', begruendung: 'passt nicht' }).greift).toBe('unklar');
    const n = pruefungAus(police, { greift: 'nein', ausschluesse: ['Überschwemmung'], fundstellen: [{ seite: 2, klausel: '§ 5' }] });
    expect(n.greift).toBe('nein');
    expect(n.fundstellen).toEqual([{ seite: 2, klausel: '§ 5' }]);
  });

  it('ohne Steckbrief immer „unklar“; Texte werden gesäubert (Nummern, IBAN)', () => {
    expect(pruefungAus({ ...police, steckbrief: null }, { greift: 'ja' }).greift).toBe('unklar');
    const j = pruefungAus(police, { greift: 'ja', fundstellen: [{ seite: 1 }], pflichten: ['Schaden unter Nr. 12345678 melden'], begruendung: 'Konto DE89370400440532013000' });
    expect(j.pflichten).toEqual(['Schaden unter Nr. [Nummer] melden']);
    expect(j.begruendung).toBe('Konto [IBAN]');
    expect(j.hotline).toBe('0800 111 2222');
  });
});

/* Frag die Akte: Stichtag, Verweise, Prompt-Regeln, Platzhalter zurück, Server-Sperre. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { antwortPrompt, auswahlPrompt, frageKontext, frageVerzeichnis, stichtagAus, verweise, zurueckuebersetzen } from './frage';
import { klartextVerdacht, textSauber } from './antwort';

const H = '2026-11-15';
const S = {
  firmen: [{ id: 'f1', name: 'Beispiel Versicherung AG', hotline: '0800 111 2222' }],
  vertraege: [{ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', firmaId: 'f1', status: 'aktiv', beitrag: 120, zahlweise: 'jaehrlich', beginn: '2026-01-01' }],
  fassungen: [], dinge: [], belege: [], fristen: [], ereignisse: [], schadenfaelle: [], zaehler: [], einst: {},
  dokumente: [{ id: '3f2a1b9c-1234-4567-89ab-123456789012', typ: 'Police', titel: 'Hausrat 2026', vertragId: 'v1', seiten: 2, datum: '2026-01-10', steckbrief: { gefahren: ['Feuer'], fundstellen: [{ seite: 2, klausel: '§ 3' }] } }],
};

describe('Frag die Akte', () => {
  it('Stichtag aus der Frage, sonst heute; ungültige Daten zählen nicht', () => {
    expect(stichtagAus('Was galt am 5.6.2025?', H)).toBe('2025-06-05');
    expect(stichtagAus('Schaden 2025-02-28', H)).toBe('2025-02-28');
    expect(stichtagAus('am 31.02.2025', H)).toBe(H);
    expect(stichtagAus('Was kostet Hausrat?', H)).toBe(H);
  });

  it('Kontext und Verzeichnis tragen Verweise statt IDs', () => {
    const { hin, zurueck } = verweise(S.dokumente.map((d) => d.id));
    const k = frageKontext(S, H, H, hin);
    expect(k.inKraft[0].steckbrief.dokumentId).toBe('D1');
    expect(frageVerzeichnis(S, hin)[0].dokumentId).toBe('D1');
    expect(zurueck.get('D1')).toBe(S.dokumente[0].id);
    expect(JSON.stringify([k, frageVerzeichnis(S, hin)])).not.toContain(S.dokumente[0].id);
  });

  it('Prompts: Regeln „unklar statt nicht versichert“, keine Beratung, Platzhalter nicht raten', () => {
    const p = antwortPrompt('Ist Feuer versichert?', { inKraft: [] }, [{ titel: 'Hausrat 2026', nr: 2, text: 'Feuer' }], H, H);
    expect(p).toContain('niemals „nicht versichert“');
    expect(p).toContain('Keine Rechts-, Steuer- oder Abschlussberatung');
    expect(p).toContain('=== Dokument „Hausrat 2026“, Seite 2 ===');
    expect(p).toContain('nicht raten');
    expect(auswahlPrompt('x?', [], H)).toContain('Beantworte die Frage NICHT');
  });

  it('Platzhalter → Namen nur für Rollen; allgemeine Platzhalter bleiben', () => {
    const liste = [{ text: 'Max Mustermann', ersatz: '[Vater]' }, { text: 'Max', ersatz: '[Vater]' }, { text: 'Musterweg 5', ersatz: '[Adresse]' }];
    expect(zurueckuebersetzen('[Vater] wohnt in [Adresse].', liste)).toBe('Max Mustermann wohnt in [Adresse].');
  });

  it('Server-Sperre und Antwort-Säuberung', () => {
    expect(klartextVerdacht(['Gilt Vertrag 12345678 noch?'])).toBe(true);
    expect(klartextVerdacht(['Ist mein Fahrrad versichert?'])).toBe(false);
    expect(textSauber('Konto DE89370400440532013000, Nr. 12345678, Hotline 0800 111 2222, Summe 65.000 €')).toBe('Konto [IBAN], Nr. [Nummer], Hotline 0800 111 2222, Summe 65.000 €');
  });
});

/* Gezielt schwärzen (Plan 17.11.2026): erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { ersetzen, kritisch, kundennummerArt, nummernFinden } from './schutz';

const H = '2026-11-17';
const L = [{ text: 'Max Mustermann', ersatz: '[Vater]' }];

describe('Gezielt schwärzen', () => {
  it('AGB-Seite ohne persönlichen Bezug: Postleitzahlen, Register-, Service- und Klauselnummern bleiben', () => {
    const t = [
      'Verantwortlicher ist die Beispiel Energie GmbH, Beispielstraße 203, 80634 München.',
      'Registergericht München HRB 123456, USt-IdNr. DE123456789',
      'Datenschutzbeauftragter: Postfach 14 75, 84001 Landshut, Telefon',
      '0871 1234567, Stand 01.01.2005, Herr Peter Beispiel',
    ].join('\n');
    expect(ersetzen(t, L, H)).toBe(t);
  });

  it('Police: Kundennummern mit eigenem Platzhalter; mit persönlichem Bezug auch andere Nummern, Namen und alte Daten', () => {
    const t = ['Herrn', 'Max Mustermann', 'Versicherungsschein-Nr.: HR-7120 6680', 'Kundennr. 4711081500', 'Ihr Berater: Herr Peter Beispiel', 'Registernummer HRB 123456', 'Beginn 01.01.2026, Antrag vom 12.03.2005', 'Postfach 14 75, 84001 Landshut'].join('\n');
    expect(ersetzen(t, L, H)).toBe(['Herrn', '[Vater]', 'Versicherungsschein-Nr.: [Versicherungsnummer]', 'Kundennr. [Kundennummer]', 'Ihr Berater: Herr [Name]', 'Registernummer [Nummer]', 'Beginn 01.01.2026, Antrag vom [Datum]', 'Postfach 14 75, 84001 Landshut'].join('\n'));
  });

  it('Zahlen ohne Bezeichnung bleiben auch auf persönlichen Seiten (Restrisiko laut Plan); Handy und IBAN immer', () => {
    const t = 'Max Mustermann\nVertrag 71206680\nmobil erreichbar 0151 23456789\nIBAN DE89 3704 0044 0532 0130 00';
    expect(ersetzen(t, L, H)).toBe('[Vater]\nVertrag 71206680\nmobil erreichbar [Telefon]\nIBAN [IBAN]');
    expect(ersetzen('AGB Seite 3\nIBAN DE89 3704 0044 0532 0130 00', L, H)).toBe('AGB Seite 3\nIBAN [IBAN]');
  });

  it('Tresor-Nummern aus der Liste werden in jeder Seite geschwärzt, auch ohne Bezeichnung', () => {
    const l = [...L, { text: '71206680', ersatz: '[Vertragsnummer]' }];
    expect(ersetzen('Bezug: 71206680 vom 01.01.2026', l, H)).toBe('Bezug: [Vertragsnummer] vom 01.01.2026');
  });

  it('Art der Kundennummer aus der Bezeichnung', () => {
    expect(kundennummerArt('Versicherungsschein-Nr.')).toBe('[Versicherungsnummer]');
    expect(kundennummerArt('Vers.-Nr.')).toBe('[Versicherungsnummer]');
    expect(kundennummerArt('Kd.-Nr.')).toBe('[Kundennummer]');
    expect(kundennummerArt('Vertragsnummer')).toBe('[Vertragsnummer]');
    expect(kundennummerArt('Schaden-Nr.')).toBe('[Schadennummer]');
    expect(kundennummerArt('Registernummer')).toBeNull();
  });

  it('Nummern für den Tresor finden (nur Tresor-Arten, ohne Doppelte)', () => {
    expect(nummernFinden(['Versicherungsschein-Nr.: HR-7120 6680', 'Kundennr. 4711081500', 'Rechnungsnummer RE-2026-0042', 'Kundennr. 4711081500', 'Registernummer HRB 123456'])).toEqual([
      { art: 'Versicherungsnummer', nummer: 'HR-7120 6680' }, { art: 'Kundennummer', nummer: '4711081500' },
    ]);
  });

  it('kritisch (Server, KI-Antworten): IBAN, Handy, Kundennummer mit Wert – nicht Platzhalter, PLZ, Registernummer', () => {
    expect(kritisch('Kundennr. 4711081500')).toBe(true);
    expect(kritisch('Handy 0151 23456789')).toBe(true);
    expect(kritisch('IBAN DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(kritisch('Kundennr. [Kundennummer], 80634 München, HRB 123456, Hotline 0800 1112222')).toBe(false);
  });
});

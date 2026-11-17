/* Genaueres Schwärzen: erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { ibanPlausibel, istMobil, kundenfelder, listeErweitern, telefonTreffer, TECHNIK_DAVOR } from './genauer';
import { anonymisieren } from './text';

describe('Genauer schwärzen', () => {
  it('IBAN: Länge muss zum Land passen (±1 für Lesefehler); Messlokation ist keine IBAN', () => {
    expect(ibanPlausibel('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(ibanPlausibel('DE89 3704 0044 0532 0130 0')).toBe(true); // ein Zeichen verlesen
    expect(ibanPlausibel('DE0001234567890000000000000012345')).toBe(false); // Messlokation, 33 Zeichen
  });
  it('technische Kennungen und Handynummern', () => {
    expect(TECHNIK_DAVOR.test('Zählernummer: ')).toBe(true);
    expect(TECHNIK_DAVOR.test('Marktlokation ')).toBe(true);
    expect(TECHNIK_DAVOR.test('Vertragsnummer: ')).toBe(false);
    expect(istMobil('0151 23456789')).toBe(true);
    expect(istMobil('15123456789', 'Telefon: +49 / ')).toBe(true);
    expect(istMobil('069 2475453', 'Fax ')).toBe(false);
  });
  it('Kundenfelder: Name, Adresse, Geburtsdatum immer; Telefon und E-Mail nur im Kundenblock', () => {
    const z = ['Angaben des Kunden', 'Name: Max Mustermann', 'Adresse: Musterweg 5, 12345 Musterstadt', 'E-Mail: max@beispiel.invalid', 'Telefon: 0123 456789', 'Geburtsdatum: 01.02.1970', '', '', '', '', 'Kundenservice', 'Telefon: 0800 111 2222'];
    const k = kundenfelder(z);
    expect(k.map((x) => [z[x.index].slice(x.start, x.ende), x.label])).toEqual([
      ['Max Mustermann', '[Name]'], ['Musterweg 5, 12345 Musterstadt', '[Adresse]'], ['max@beispiel.invalid', '[E-Mail]'], ['0123 456789', '[Telefon]'], ['01.02.1970', '[Geburtsdatum]'],
    ]);
    expect(kundenfelder(['Name des Versicherers: Beispiel AG', 'Name:'])).toEqual([]);
  });
  it('Schwärzliste: Straße in anderen Schreibweisen; Telefon über die Ziffern', () => {
    const l = listeErweitern([{ text: 'Musterweg 5', ersatz: '[Zuhause]' }, { text: 'Beispielstraße 14', ersatz: '[Zuhause]' }]);
    expect(anonymisieren('Adresse: Beispielstr. 14, 12345 Musterstadt', l).text).toBe('Adresse: [Zuhause], 12345 Musterstadt');
    expect(anonymisieren('Beispiel Str. 14', listeErweitern([{ text: 'Beispiel Straße 14', ersatz: '[Zuhause]' }])).text).toBe('[Zuhause]');
    const tel = [{ text: '0151 2345 6789', ersatz: '[Telefon]' }];
    const t = 'Telefon: +49 / 15123456789, Fax 069 1234567';
    expect(telefonTreffer(t, tel).map((x) => t.slice(x.start, x.ende))).toEqual(['+49 / 15123456789']);
    expect(telefonTreffer('Hotline 0800 111 2222', tel)).toEqual([]);
  });
});

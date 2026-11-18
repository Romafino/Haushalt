/* Freitext-Prüfung: erfundene Beispiele. */
import { describe, expect, it } from 'vitest';
import { freitextPruefen } from './freitext';

describe('freitextPruefen', () => {
  it.each([
    ['IBAN DE89 3704 0044 0532 0130 00', /IBAN/],
    ['geb. 03.05.1970', /Geburtsdatum/],
    ['Vertragsnummer: AB-12345/7', /nummern/i],
    ['Kundennr. 4711 0815', /nummern/i],
    ['Rechnung 2026-004711', /nummern/i],
    ['Police 71206680 liegt im Ordner', /nummern/i],
  ])('lehnt ab: %s', (text, muster) => {
    expect(freitextPruefen(text)).toMatch(muster);
  });

  it.each([
    'Hausrat, Wohnfläche 140 m²',
    'Beitrag 1.200,00 € pro Jahr',
    'Ordner im Arbeitszimmer, Fach 3',
    'Kündigung nur schriftlich, § 5 Nr. 2',
    'Wartung jedes Jahr im Mai',
    '',
  ])('lässt zu: %s', (text) => {
    expect(freitextPruefen(text)).toBeNull();
  });

  it('normal erlaubt eine Postanschrift mit Postleitzahl, aber keine Nummern hinter Bezeichnungen', () => {
    expect(freitextPruefen('Brief an Beispielstraße 1, 12345 Musterstadt', 'normal')).toBeNull();
    expect(freitextPruefen('Brief an Beispielstraße 1, 12345 Musterstadt', 'streng')).not.toBeNull();
    expect(freitextPruefen('Kundennummer 4711 0815 angeben', 'normal')).not.toBeNull();
  });

  it('keine: z. B. Telefon und Hotline', () => {
    expect(freitextPruefen('0800 1234567', 'keine')).toBeNull();
  });

  describe('Ausnahmen (18.11.2026)', () => {
    const L = [{ text: '069 1234 567-89', ersatz: '[Telefon]' }];
    it('Normnummern sind erlaubt', () => {
      expect(freitextPruefen('Heizlast nach DIN EN 12831, Elektro nach DIN 18015')).toBeNull();
      expect(freitextPruefen('Zertifikat DIN EN ISO 9001:2015')).toBeNull();
      expect(freitextPruefen('DIN 18015, Vertrag 71206680')).toMatch(/71206680/);
    });
    it('Firmen-Telefon und -Fax mit Bezeichnung sind erlaubt (bei entsperrter Schwärzliste)', () => {
      const t = 'Team Kundenberatung\nTelefon 069 2475 453-53\nTelefax 069 2475 453-99';
      expect(freitextPruefen(t, 'streng', L)).toBeNull();
      expect(freitextPruefen('Hotline: 0800 1234567', 'streng', [])).toBeNull();
    });
    it('Telefonnummer ohne entsperrte Schwärzliste, Handynummer oder eigene Nummer: abgelehnt', () => {
      expect(freitextPruefen('Telefon 069 2475 453-53')).toMatch(/entsperrter Schwärzliste/);
      expect(freitextPruefen('Tel. 0151 23456789', 'streng', [])).toMatch(/Handynummern/);
      expect(freitextPruefen('Telefon 069 1234567-89', 'streng', L)).toMatch(/Schwärzliste/);
    });
    it('Nummer ohne Bezeichnung bleibt gesperrt, die Meldung nennt sie', () => {
      expect(freitextPruefen('Ansprechpartner 069 2475 453-53', 'streng', [])).toMatch(/gefunden: /);
      expect(freitextPruefen('Kundennummer 4711 0815, Telefon 069 2475 453-53', 'streng', [])).toMatch(/nummern/i);
    });
  });
});

/* Nummern-Tresor: Prüfung, Verschlüsselung, Schwärzen, Kündigungsentwurf. Erfundene Nummern. */
import { describe, expect, it } from 'vitest';
import { anonymisieren } from './text';
import { neuesSalz, schluesselAus } from './krypto';
import { mitKundennummer, nummernEinsetzen, nummerPruefen, tresorAlsListe, tresorAus, tresorOeffnen, tresorVerschluesseln, type Tresor } from './tresor';

const T: Tresor = { v1: [{ art: 'Versicherungsnummer', nummer: 'HR-7120 6680' }, { art: 'Kundennummer', nummer: 'K 4711-0815' }] };

describe('Nummern-Tresor', () => {
  it('Prüfung: Art, Länge, keine IBAN', () => {
    expect(nummerPruefen({ art: 'Kundennummer', nummer: 'K 4711-0815' })).toBeNull();
    expect(nummerPruefen({ art: 'Lieblingsnummer', nummer: '12345' })).toContain('Art');
    expect(nummerPruefen({ art: 'Kundennummer', nummer: '12' })).toContain('3 bis 60');
    expect(nummerPruefen({ art: 'Kundennummer', nummer: 'DE89 3704 0044 0532 0130 00' })).toContain('IBAN');
  });

  it('verschlüsselt mit dem Schlüssel der Schwärzliste; Klartext nicht in der Box; bereinigt beim Öffnen', async () => {
    const key = (await schluesselAus('vier zufällige Wörter', neuesSalz(), 1000)) as CryptoKey;
    const box = await tresorVerschluesseln(key, T);
    expect(JSON.stringify(box)).not.toContain('7120');
    expect(await tresorOeffnen(key, box)).toEqual(T);
    expect(tresorAus({ nummern: { v1: [{ art: 'Kundennummer', nummer: 'x' }, { art: 'Kundennummer', nummer: 'K 4711' }], v2: 'kaputt' } })).toEqual({ v1: [{ art: 'Kundennummer', nummer: 'K 4711' }] });
  });

  it('Schwärzen: Nummer auch ohne Trennzeichen wird zu [Nummer]', () => {
    const l = tresorAlsListe(T);
    expect(anonymisieren('Versicherungsschein HR-7120 6680, Kunde K47110815', l).text).toBe('Versicherungsschein [Versicherungsnummer], Kunde [Kundennummer]');
  });

  it('Kündigungsentwurf: Kundennummer bevorzugt, ohne Nummer bleibt der Platzhalter', () => {
    expect(mitKundennummer('Kundennummer [Kundennummer]', T.v1)).toBe('Kundennummer K 4711-0815');
    expect(mitKundennummer('Kundennummer [Kundennummer]', [{ art: 'Vertragsnummer', nummer: 'V-123' }])).toBe('Kundennummer V-123');
    expect(mitKundennummer('Kundennummer [Kundennummer]', undefined)).toBe('Kundennummer [Kundennummer]');
  });

  it('Nummern auf dem Gerät wieder einsetzen (je Art, nur für den Vertrag)', () => {
    expect(nummernEinsetzen('Vers.-Nr. [Versicherungsnummer], Kunde [Kundennummer], [Nummer]', T.v1)).toBe('Vers.-Nr. HR-7120 6680, Kunde K 4711-0815, [Nummer]');
    expect(nummernEinsetzen('Vers.-Nr. [Versicherungsnummer]', undefined)).toBe('Vers.-Nr. [Versicherungsnummer]');
  });
});

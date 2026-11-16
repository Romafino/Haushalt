/* Seitentext aus Wörtern und Balken. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { alteDaten, anschriftZeilen, autoBalken, listenTreffer, musterBereiche, nummernTreffer, seitenText, type Stueck } from './seitentext';

const L = [{ text: 'Max Mustermann', ersatz: '[Vater]' }, { text: 'Musterweg 5', ersatz: '[Adresse]' }];
// zwei Zeilen: "Herrn Max Mustermann" / "Vertrag 71206680 Beispielstadt"
let x = 0;
const w = (str: string, y: number): Stueck => { const s = { str, x0: x, x1: x + str.length * 10, y0: y, y1: y + 12 }; x += str.length * 10 + 6; return s; };
const zeile = (y: number, ...worte: string[]) => { x = 0; return worte.map((t) => w(t, y)); };
const STUECKE = [...zeile(0, 'Herrn', 'Max', 'Mustermann'), ...zeile(40, 'Vertrag', '71206680', 'Erika'), ...zeile(80, 'Musterweg', '5')];

describe('seitenText', () => {
  it('automatische Balken: Liste und lange Nummern werden zu Platzhaltern', () => {
    const balken = autoBalken(STUECKE, L);
    expect(balken.filter((b) => b.quelle === 'ziffern')).toHaveLength(1);
    expect(seitenText(STUECKE, balken, L)).toBe('Herrn [Vater]\nVertrag [Nummer] Erika\n[Adresse]');
  });

  it('von Hand gezogener Balken (Erika) ersetzt das Wort, auch ohne Listeneintrag', () => {
    const erika = STUECKE.find((s) => s.str === 'Erika')!;
    const hand = { x: erika.x0 - 2, y: erika.y0 - 2, w: erika.x1 - erika.x0 + 4, h: 16, label: '[Mutter]' };
    expect(seitenText(STUECKE, [hand], L)).toBe('Herrn [Vater]\nVertrag [Nummer] [Mutter]\n[Adresse]');
  });

  it('Balken ohne gültigen Platzhalter → [geschwärzt]; zweite Absicherung über die Liste greift auch ohne Balken', () => {
    const erika = STUECKE.find((s) => s.str === 'Erika')!;
    expect(seitenText(STUECKE, [{ x: erika.x0, y: erika.y0, w: 60, h: 12, label: 'Mutter' }], L)).toContain('[geschwärzt]');
    expect(seitenText(STUECKE, [], L)).toBe('Herrn [Vater]\nVertrag [Nummer] Erika\n[Adresse]');
  });

  it('ohne erkannte Wörter: leerer Text', () => {
    expect(seitenText(null, [], L)).toBe('');
  });
});

describe('listenTreffer', () => {
  it('findet übrig gebliebene Einträge (auch GROSS), meldet saubere Texte als leer', () => {
    expect(listenTreffer('Sehr geehrter Herr MAX MUSTERMANN', L)).toEqual(['MAX MUSTERMANN']);
    expect(listenTreffer('Sehr geehrter [Vater]', L)).toEqual([]);
  });
});

describe('nummernTreffer', () => {
  const nummern = (t: string) => nummernTreffer(t).map((x) => t.slice(x.start, x.ende));
  it('schwärzt Nummern, lässt Datum, Beträge und Firmentelefon stehen', () => {
    expect(nummern('Vertrag 71206680 gültig ab 01.01.2026 bis 2027-12-31, Beitrag 1.200,00 €')).toEqual(['71206680']);
    expect(nummern('Kunde 4711 0815 12, geb. am 3. 5. 1970')).toEqual(['4711 0815 12']);
    expect(nummern('Schadenhotline: 0800 111 2222, Fax 0800 111 3333')).toEqual([]);
    expect(nummern('Rechnung RE-2026-004711')).toEqual(['2026-004711']);
    expect(nummern('Versicherungssumme 65.000 €, Haftpflicht 10.000.000 EUR')).toEqual([]);
    expect(musterBereiche('Versicherungsschein-Nr.: 12.345.678').map((x) => x.label)).toEqual(['[Nummer]']);
  });
});

describe('musterBereiche (auch im Bild schwärzen)', () => {
  const bereiche = (t: string) => musterBereiche(t).map((x) => [t.slice(x.start, x.ende), x.label]);
  it('Geburtsdatum, Nummer hinter Bezeichnung (auch mit Buchstaben), Name nach Anrede', () => {
    expect(bereiche('geb. am 03.05.1970')).toEqual([['03.05.1970', '[Geburtsdatum]']]);
    expect(bereiche('Vertragsnummer: AB-12/7')).toEqual([['AB-12/7', '[Nummer]']]);
    expect(bereiche('Ihr Ansprechpartner Herr Peter Beispiel')).toEqual([['Peter Beispiel', '[Name]']]);
    expect(bereiche('Tel. 0800 111 2222, § 3 Nr. 2, gültig ab 01.01.2026')).toEqual([]);
  });
  it('jede Stelle der Text-Absicherung bekommt auch einen Balken im Bild', () => {
    x = 0;
    const st = [...zeile(0, 'Kundennr.', 'AB-12/7'), ...zeile(40, 'geb.', 'am', '03.05.1970'), ...zeile(80, 'Frau', 'Anna', 'Beispiel')];
    const b = autoBalken(st, L);
    expect(b.map((x) => x.label).sort()).toEqual(['[Geburtsdatum]', '[Name]', '[Nummer]']);
    expect(seitenText(st, b, L)).toBe('Kundennr. [Nummer]\ngeb. am [Geburtsdatum]\nFrau [Name]');
  });
});

describe('autoBalken: keine überlagerten Platzhalter', () => {
  it('Listentreffer und IBAN haben Vorrang vor Name nach Anrede und Nummer', () => {
    x = 0;
    const L2 = [...L, { text: '12345 Musterstadt', ersatz: '[Adresse]' }];
    const st = [...zeile(0, 'Herrn', 'Max', 'Mustermann'), ...zeile(40, '12345', 'Musterstadt'), ...zeile(80, 'IBAN', 'DE89', '3704', '0044', '0532', '0130', '00')];
    expect(autoBalken(st, L2).map((b) => b.label).sort()).toEqual(['[Adresse]', '[IBAN]', '[Vater]']);
  });
});

describe('Anschriftenfeld ohne Schwärzliste', () => {
  it('erkennt Name und Anschrift unter „Herrn“/„Frau“, nicht aber normale Zeilen', () => {
    expect(anschriftZeilen(['Beispiel AG', 'Herrn', 'Max Mustermann', 'Musterweg 5', '12345 Musterstadt', 'Versicherungsschein']))
      .toEqual([{ index: 2, label: '[Name]' }, { index: 3, label: '[Adresse]' }, { index: 4, label: '[Adresse]' }]);
    expect(anschriftZeilen(['Frau', 'Erika Mustermann', 'Am Hang 12 a', 'Sehr geehrte Frau'])).toEqual([{ index: 1, label: '[Name]' }, { index: 2, label: '[Adresse]' }]);
    expect(anschriftZeilen(['Herrn Dr. Max Beispiel', 'Musterweg 5'])).toEqual([]);
    // ohne Anrede: Straße direkt über PLZ/Ort
    expect(anschriftZeilen(['Beispiel Versicherung AG', '[Name]', 'Musterweg 5', '12345 Musterstadt', 'Versicherungsschein']))
      .toEqual([{ index: 2, label: '[Adresse]' }, { index: 3, label: '[Adresse]' }]);
    // eine Straße allein oder Absenderzeile mit Punkten bleibt
    expect(anschriftZeilen(['Musterweg 5', 'Versicherungsschein'])).toEqual([]);
    expect(anschriftZeilen(['Musterallee 1 · 10115 Beispielstadt', 'Herrn'])).toEqual([]);
  });
  it('Balken und Text: Anschrift im Bild und im gespeicherten Text ersetzt', () => {
    x = 0;
    const st = [...zeile(0, 'Herrn'), ...zeile(20, 'Max', 'Mustermann'), ...zeile(40, 'Musterweg', '5'), ...zeile(60, '12345', 'Musterstadt'), ...zeile(100, 'Hausrat')];
    const b = autoBalken(st, []);
    expect(seitenText(st, b, [])).toBe('Herrn\n[Name]\n[Adresse]\n[Adresse]\nHausrat');
  });

  it('Monat/Jahr, Zeiträume und Werte mit Einheit bleiben stehen; echte Nummern nicht', () => {
    const n = (s: string) => nummernTreffer(s).map((x) => s.slice(x.start, x.ende));
    expect(n('Kfz-Tarif 10/2026')).toEqual([]);
    expect(n('Bedingungen Stand 01/2026 und 10.2026')).toEqual([]);
    expect(n('gültig 2026/2027, Tarif 2026-10')).toEqual([]);
    expect(n('Summe 65000 € oder 65000 EUR')).toEqual([]);
    expect(n('Zählerstand 12345 kWh, Laufleistung 15000 km')).toEqual([]);
    expect(n('Vertragsnummer 123456789')).toEqual(['123456789']);
    expect(n('Kunde 4711081500 seit 10/2026')).toEqual(['4711081500']);
    expect(n('Code 13/2026')).toEqual(['13/2026']); // kein Monat
  });

  it('Firmenanschrift (Firmenname darüber oder Telefon/Fax darunter) wird nicht als Anschrift geschwärzt', () => {
    expect(anschriftZeilen(['Versicherungsservice der', 'Musterstadt Sparkasse', 'Erika Beispiel', 'Neue Allee 47', '12345 Musterstadt', 'Fax 0123 456-78'])).toEqual([]);
    expect(anschriftZeilen(['Beispiel Versicherung AG', 'Musterweg 5', '12345 Musterstadt'])).toEqual([]);
    // geschwärzter Name direkt darüber: immer Familie, auch mit Kontaktzeile darunter
    expect(anschriftZeilen(['[Name]', 'Musterweg 5', '12345 Musterstadt', 'Tel. privat'])).toEqual([{ index: 1, label: '[Adresse]' }, { index: 2, label: '[Adresse]' }]);
    expect(anschriftZeilen(['Kundenbrief', '[Name]', 'Musterweg 5', '12345 Musterstadt', 'Versicherungsschein'])).toEqual([{ index: 2, label: '[Adresse]' }, { index: 3, label: '[Adresse]' }]);
    expect(anschriftZeilen(['Beispiel Versicherung AG · Postfach 1', 'Herrn', 'Max Mustermann', 'Musterweg 5', '12345 Musterstadt'])).toEqual([{ index: 2, label: '[Name]' }, { index: 3, label: '[Adresse]' }, { index: 4, label: '[Adresse]' }]);
  });

  it('Daten älter als 15 Jahre werden zu [Datum] (mögliche Geburtstage); neuere und bloße Jahreszahlen bleiben', () => {
    const H = '2026-11-16';
    const a = (s: string) => alteDaten(s, H).map((x) => s.slice(x.start, x.ende));
    expect(a('geboren 12.03.1965, Beginn 01.01.2026')).toEqual(['12.03.1965']);
    expect(a('am 12.3.65 und 01.01.26')).toEqual(['12.3.65']);
    expect(a('1965-03-12 / 2020-05-01')).toEqual(['1965-03-12']);
    expect(a('seit 12. März 1965')).toEqual(['12. März 1965']);
    expect(a('Grenze: 16.11.2011 bleibt, 15.11.2011 nicht')).toEqual(['15.11.2011']);
    expect(a('Baujahr 1998, Tarif 10/2026, 31.02.1960')).toEqual([]);
  });
});

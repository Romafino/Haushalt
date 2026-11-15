/* Seitentext aus Wörtern und Balken. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { autoBalken, listenTreffer, musterBereiche, nummernTreffer, seitenText, type Stueck } from './seitentext';

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

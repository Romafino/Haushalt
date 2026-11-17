/* Rückgängig im Schwärz-Editor. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { geschuetzt, leererVerlauf, MAX_SCHRITTE, merken, rueckgaengig, wiederholen } from './verlauf';
import { autoBalken, seitenText, type Balken, type Stueck } from './seitentext';

const b = (x: number, quelle = 'hand'): Balken => ({ x, y: 0, w: 10, h: 10, label: '[Name]', quelle });

describe('Verlauf', () => {
  it('rückgängig und wiederholen über mehrere Schritte', () => {
    const s0: Balken[] = [], s1 = [b(1)], s2 = [b(1), b(2)];
    let v = merken(merken(leererVerlauf(), s0), s1);
    const r1 = rueckgaengig(v, s2)!;
    expect(r1.balken).toEqual(s1);
    const r2 = rueckgaengig(r1.verlauf, r1.balken)!;
    expect(r2.balken).toEqual(s0);
    expect(rueckgaengig(r2.verlauf, r2.balken)).toBeNull();
    const w1 = wiederholen(r2.verlauf, r2.balken)!;
    expect(w1.balken).toEqual(s1);
    expect(wiederholen(w1.verlauf, w1.balken)!.balken).toEqual(s2);
    // neue Änderung nach Rückgängig: Wiederholen verfällt
    v = merken(r1.verlauf, r1.balken);
    expect(wiederholen(v, [b(3)])).toBeNull();
  });

  it('höchstens MAX_SCHRITTE Schritte', () => {
    let v = leererVerlauf();
    for (let i = 0; i < MAX_SCHRITTE + 10; i++) v = merken(v, [b(i)]);
    expect(v.zurueck).toHaveLength(MAX_SCHRITTE);
    expect(v.zurueck[0]).toEqual([b(10)]);
  });

  it('geschützt: Liste, IBAN, Handy – nicht von Hand gezogene oder andere', () => {
    expect(geschuetzt(b(0, 'liste'))).toBe(true);
    expect(geschuetzt(b(0, 'iban'))).toBe(true);
    expect(geschuetzt(b(0, 'handy'))).toBe(true);
    expect(geschuetzt(b(0, 'hand'))).toBe(false);
    expect(geschuetzt(b(0, 'nummer'))).toBe(false);
  });

  it('entfernter Balken über einem Listeneintrag: gespeicherter Text bleibt trotzdem ersetzt', () => {
    const L = [{ text: 'Max Mustermann', ersatz: '[Vater]' }];
    let x = 0;
    const w = (str: string): Stueck => { const s = { str, x0: x, x1: x + str.length * 10, y0: 0, y1: 12 }; x += str.length * 10 + 6; return s; };
    const st = [w('Herrn'), w('Max'), w('Mustermann')];
    const balken = autoBalken(st, L);
    expect(balken.some(geschuetzt)).toBe(true);
    expect(seitenText(st, balken.filter((x) => !geschuetzt(x)), L)).toBe('Herrn [Vater]');
  });
});

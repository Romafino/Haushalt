/* Übertragen aus altbestand/tests/test_schwaerzer.js. Prüfungen unverändert; läuft gegen lib/regeln und lib/schwaerzen. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert';
import { test } from 'vitest';
import * as SW from '@/lib/schwaerzen';
const S: any = SW;

test('Altbestand schwaerzer', async () => {
  const eq = (a: any, b: any, n: any) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
  const L = [{ text: 'Max Mustermann', label: 'Papa' }, { text: 'Mustermann', label: '[Name]' }, { text: 'Musterweg', label: '' }];
  eq(S.treffer('Herrn Max Mustermann, Musterweg 5', L).map((t: any) => [t.start, t.ende, t.label]), [[6, 20, 'Papa'], [22, 31, '']], 'Liste: längster Treffer gewinnt, freie Beschriftung, leere Beschriftung erlaubt');
  eq(S.treffer('MUSTERMANN und Mustermanns', L).map((t: any) => t.label), ['[Name]'], 'Groß geschrieben ja, mitten im Wort nein');
  eq(S.treffer('IBAN DE89 3704 0044 0532 0130 00, Vertrag 71206680, Betrag 1.200,00', [], { iban: true, ziffern: true }).map((t: any) => [t.quelle, t.label]), [['iban', '[IBAN]'], ['ziffern', '[Nummer]']], 'IBAN und lange Nummern, Beträge bleiben');
  eq(S.treffer('Tel. 0151 700 61273', [], { ziffern: true }).length, 1, 'Telefonnummer mit Leerzeichen als ein Treffer');
  eq(S.liesListe('Max Mustermann;Papa\rMusterweg 5;Zuhause von uns allen bis zur Grenze von dreißig\rOhneLabel\nx;y'), [{ text: 'Max Mustermann', label: 'Papa' }, { text: 'Musterweg 5', label: 'Zuhause von uns allen bis zur ' }, { text: 'OhneLabel', label: '' }], 'Textliste: freie Beschriftung bis 30 Zeichen, Mac-Zeilenenden');
  eq(S.liesListe(JSON.stringify({ app: 'haushalts-app', art: 'schwaerzliste', liste: [{ text: 'Max Mustermann', ersatz: '[Vater]' }] })), [{ text: 'Max Mustermann', label: '[Vater]' }], 'Export der Haushalts-App wird übernommen');
  const zl = S.zeileAus([{ str: 'Herrn', x0: 0, x1: 50, y0: 10, y1: 20 }, { str: 'Max', x0: 60, x1: 90, y0: 10, y1: 20 }, { str: 'Mustermann', x0: 95, x1: 195, y0: 10, y1: 20 }]);
  eq([zl.text, zl.kasten(6, 20)], ['Herrn Max Mustermann', { x: 60, y: 10, w: 135, h: 10 }], 'Zeile aus Wörtern: Text und Rechteck über mehrere Wörter');
  const b = S.balkenFuer([{ str: 'Herrn Max', x0: 0, x1: 90, y0: 10, y1: 20 }, { str: 'Mustermann', x0: 95, x1: 195, y0: 11, y1: 21 }, { str: 'andere Zeile', x0: 0, x1: 100, y0: 40, y1: 50 }], L);
  eq(b.map((x: any) => [Math.round(x.x), x.label]), [[55, 'Papa']], 'Balken über zwei PDF-Textstücke in einer Zeile');
  console.log('\nAlle Tests bestanden.');
});

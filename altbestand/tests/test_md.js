const L = require('../haushalts-app/logic.js'); const assert = require('assert');
const S = { vertraege: [{ id: 'v1', kurzname: 'Hausrat' }], firmen: [{ id: 'f1', name: 'Beispiel AG' }], dinge: [] };
const d = { id: 'p1', typ: 'Police', titel: 'Hausrat | 2026', datum: '2026-01-15', gueltigVon: '2026-01-01', vertragId: 'v1', firmaId: 'f1', seiten: 2, dateien: [],
  steckbrief: { gefahren: ['Feuer', 'Einbruch'], summen: [{ was: 'Hausrat', betrag: '65.000 €' }], selbstbeteiligung: '150 €', fundstellen: [{ thema: 'Einbruch', seite: 2, klausel: '§ 3' }] } };
const md = L.dokMarkdown(d, [{ nr: 2, text: 'Zweite Seite\nmit [Vater]' }, { nr: 1, text: 'Erste Seite' }], S);
console.log(md);
assert(md.startsWith('# Hausrat | 2026\n') && md.includes('| Vertrag | Hausrat |') && md.includes('| Firma | Beispiel AG |') && md.includes('| Datum | 15.01.2026 |'));
assert(md.includes('### Versichert\n\n- Feuer\n- Einbruch') && md.includes('- Hausrat · 65.000 €') && md.includes('- Einbruch · S. 2 · § 3') && md.includes('### Selbstbeteiligung\n\n150 €'));
assert(md.indexOf('### Seite 1') < md.indexOf('### Seite 2') && md.includes('Zweite Seite\nmit [Vater]') && md.includes('nicht gespeichert, nur Text'));
assert(!md.includes('undefined') && !md.includes('null'));
assert.deepStrictEqual(L.mdNamen([d, { id: 'p2', typ: 'Police', titel: 'Hausrat | 2026', datum: '2026-01-15' }, { id: 'p3', typ: 'Brief' }]), { p1: '2026-01-15-Police-Hausrat-2026.md', p2: '2026-01-15-Police-Hausrat-2026-2.md', p3: 'ohne-Datum-Brief.md' });
assert(L.dokMarkdown({ id: 'x', typ: 'Brief' }, [], S).includes('(kein Text gespeichert)'));
console.log('ok  Markdown: Kopf, Steckbrief, Seiten in Reihenfolge, eindeutige Dateinamen, leeres Dokument');

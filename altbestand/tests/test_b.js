const L = require('../haushalts-app/logic.js'); const assert = require('assert');
const eq = (a, b, n) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
const sw = [{ text: 'Max Mustermann', ersatz: '[Vater]' }, { text: 'Mustermann', ersatz: '[Name]' }, { text: 'Musterweg 5', ersatz: '[Adresse]' }, { text: 'VS-123456789', ersatz: '[Nummer]' }, { text: 'x', ersatz: '[Name]' }, { text: 'Hausrat', ersatz: 'boese <b>' }];
eq(L.schwaerzen('Herr Max Mustermann, Musterweg 5, Vertrag VS-123456789, Fam. Mustermann', sw), 'Herr [Vater], [Adresse], Vertrag [Nummer], Fam. [Name]', 'Namen, Adresse, Nummer geschwärzt (längste zuerst)');
eq(L.schwaerzen('IBAN: DE89 3704 0044 0532 0130 00 bei Bank', []), 'IBAN: [IBAN] bei Bank', 'IBAN mit Leerzeichen per Muster');
eq(L.schwaerzen('DE89370400440532013000', []), '[IBAN]', 'IBAN ohne Leerzeichen');
eq(L.schwaerzen('geb. am 03.05.1970 in X; Beginn 01.01.2026', []), 'geb. am [Geburtsdatum] in X; Beginn 01.01.2026', 'Geburtsdatum per Muster, andere Daten bleiben');
eq(L.schwaerzen('Hausrat', sw), '[entfernt]', 'ungültiger Ersatztext wird neutralisiert');
const r = L.bereinigen({
  dokument: { typ: 'Police', titel: 'Hausrat Max Mustermann', datum: '2026-01-15', gueltigVon: '01.01.2026' },
  firma: { name: 'Beispiel AG', art: 'Bank' },
  vertrag: { kurzname: 'Hausrat', art: 'Versicherung', fuerWen: 'Max', beitrag: '120', zahlweise: 'jaehrlich', laufzeitende: '2026-12-31', fristWert: 3, fristEinheit: 'Monate', versicherungsnummer: 'VS-123456789' },
  bezug: { vertragId: 'gibtsnicht', firmaId: 'f1' },
  datenschutz: { iban: true, policeUngeschwaerzt: 'ja' },
  steckbrief: { gefahren: ['Feuer', 'Einbruch bei Max Mustermann'], versicherungsnummer: 'VS-123456789', summen: [{ was: 'Hausrat', betrag: 65000 }] },
  schwaerzen: sw.slice(0, 4), unsicher: ['vertrag.laufzeitende', 5],
}, { vertraege: ['v1'], dinge: [], firmen: ['f1'] });
eq(r.dokument, { typ: 'Police', titel: 'Hausrat [Vater]', datum: '2026-01-15' }, 'Dokument: Name ersetzt, falsches Datumsformat verworfen');
eq(r.firma, { name: 'Beispiel AG' }, 'Firma: unbekannte Art verworfen');
eq(r.vertrag, { kurzname: 'Hausrat', art: 'Versicherung', zahlweise: 'jaehrlich', laufzeitende: '2026-12-31', fristWert: 3, fristEinheit: 'Monate' }, 'Vertrag: keine Nummer, kein Name als Rolle, Text statt Zahl verworfen');
eq(r.bezug, { vertragId: null, dingId: null, firmaId: 'f1' }, 'Bezug: nur vorhandene IDs');
eq(r.datenschutz, { iban: true, geburtsdatum: false, gesundheit: false, ausweis: false, policeUngeschwaerzt: false }, 'Datenschutz: nur echte true-Werte');
eq(r.steckbrief, { gefahren: ['Feuer', 'Einbruch bei [Vater]'], summen: [{ was: 'Hausrat', betrag: 65000 }] }, 'Steckbrief: Nummernfeld entfernt, Name ersetzt');
eq(r.unsicher, ['vertrag.laufzeitende'], 'unsicher: nur Texte');
eq(L.bereinigen(null, { vertraege: [], dinge: [], firmen: [] }).dokument, { typ: 'Brief' }, 'leere KI-Antwort: sicherer Leervorschlag');
eq(L.stapel(5, 10), [{ von: 0, bis: 1, jeSeite: 2 }, { von: 2, bis: 3, jeSeite: 2 }, { von: 4, bis: 4, jeSeite: 2 }], 'Seitenstapel bei 10 Bildern je Aufruf');
eq(L.stapel(2, 1), [{ von: 0, bis: 0, jeSeite: 1 }, { von: 1, bis: 1, jeSeite: 1 }], 'Seitenstapel bei 1 Bild je Aufruf');
console.log('\nAlle Tests bestanden.');

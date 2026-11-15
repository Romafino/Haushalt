const L = require('../haushalts-app/logic.js'); const assert = require('assert');
const eq = (a, b, n) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
const T = '2026-11-12';
eq(['monatlich', 'zweimonatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich', 'woechentlich', 'vierzehntaegig', 'einmalig'].map(z => Math.round(L.proMonat({ beitrag: 120, zahlweise: z }) * 100) / 100), [120, 60, 40, 20, 10, 520, 260, 0], 'Zahlweisen: Betrag je Monat, einmalig zählt nicht');
eq(L.fixkosten([{ status: 'aktiv', beitrag: 500, zahlweise: 'einmalig' }, { status: 'aktiv', beitrag: 30, zahlweise: 'zweimonatlich' }]), { monat: 15, jahr: 180 }, 'Fixkosten mit neuen Zahlweisen');
const S = { firmen: [], fassungen: [], dokumente: [], belege: [], fristen: [], ereignisse: [], schadenfaelle: [],
  dinge: [{ id: 'h', name: 'Haus', kategorie: 'Haus', status: 'aktiv' }, { id: 'w', name: 'WG-Zimmer', kategorie: 'Haus', status: 'verkauft' }, { id: 'a', name: 'Kombi', kategorie: 'Auto' }],
  vertraege: [{ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', status: 'aktiv', dingId: 'h', weitereDingIds: ['w'], fuerWen: 'Familie', weitereRollen: ['Tochter'] },
              { id: 'v2', kurzname: 'Schutzbrief', art: 'Versicherung', status: 'aktiv', dingId: 'h', weitereDingIds: ['a'] }] };
eq([L.dingeVon(S.vertraege[0]), L.rollenVon(S.vertraege[0]), L.dingeVon({}), L.rollenVon({ fuerWen: 'Vater' })], [['h', 'w'], ['Familie', 'Tochter'], [], ['Vater']], 'mehrere Dinge und Rollen je Vertrag');
eq(L.dingFolgen(S.dinge[1], 'aktiv', S, T).hinweise, ['Neuer Termin am 19.11.2026: Prüfen: Hausrat nach Verkauf von WG-Zimmer'], 'weiteres Ding verkauft: Vertrag wird zur Prüfung vorgelegt');
eq(L.lebensFolgen('umzug', '2027-04-01', S, T).hinweise.slice(-1), ['Aufgabe zum 01.04.2027: Tochter zieht um: Vertrag „Hausrat“ prüfen'], 'Lebensereignis findet Vertrag über die weitere Rolle');
eq([L.istKfz(S.vertraege[1], S), L.istKfz(S.vertraege[0], S)], [true, false], 'Kfz-Erkennung über ein weiteres Ding');
const k = L.akteKontext(S, T, T).inKraft[0]; eq([k.fuerWen, k.bezug], ['Familie, Tochter', 'Haus, WG-Zimmer'], 'Frage-Kontext nennt alle Rollen und Dinge');
eq(L.exportTabellen(S, T)['Verträge'][0].Bezug, 'Haus, WG-Zimmer', 'Excel nennt alle Dinge');
const v = { kurzname: 'Hausrat', laufzeitende: '2026-12-31' };
eq(L.kuendigungsText(v, { name: 'Beispiel AG' }, T, 'An {Anbieter} am {Datum}: {Vertrag} endet zum {Vertragsende}. [Name] {Unbekannt}'), 'An Beispiel AG am 12.11.2026: Hausrat endet zum 31.12.2026, hilfsweise zum nächstmöglichen Termin. [Name] {Unbekannt}', 'eigene Kündigungsvorlage: Platzhalter ersetzt, Unbekanntes bleibt');
eq(L.kuendigungsText(v, null, T, '  '), L.kuendigungsText(v, null, T), 'leere Vorlage: Standardtext');
eq([L.sofortListe({ texte: { sofort: ['Eigene Maßnahme'] } }), L.sofortListe({}).length, L.sofortListe({ texte: { sofort: [] } }).length], [['Eigene Maßnahme'], 4, 4], 'Sofortmaßnahmen: eigene Liste, sonst Standard');
console.log('\nAlle Tests bestanden.');

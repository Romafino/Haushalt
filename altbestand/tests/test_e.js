const L = require('../haushalts-app/logic.js'); const assert = require('assert');
const eq = (a, b, n) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
const T = '2026-11-12';
const S = { firmen: [{ id: 'f1', name: 'Beispiel AG' }], dinge: [], belege: [{ id: 'b1', titel: 'Wartung', datum: '2026-05-10', betrag: 320, arbeitskosten: 210, steuer: 'handwerker', unbar: true }], ereignisse: [], dokumente: [], fassungen: [], schadenfaelle: [], einst: { vorlauf: 42 },
  vertraege: [{ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', firmaId: 'f1', status: 'aktiv', beitrag: 120, zahlweise: 'jaehrlich', laufzeitende: '2027-03-31', fristWert: 6, fristEinheit: 'Wochen' }],
  fristen: [{ id: 't1', titel: 'Kfz: Kündigungsfrist prüfen', datum: '2026-11-20', status: 'offen', notiz: 'Zugang bis 30.11.2026; falls, nötig' }] };
// Kalenderdatei
const ics = L.icsText(L.alleFristen(S).filter(f => f.id === 't1'), 42, '20261112T080000Z');
assert(ics.includes('DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261121')); console.log('ok  Kalenderdatei: ganztägig am 20.11.2026');
assert(ics.includes('UID:haushalt-t1-2026-11-20@haushalts-app') && ics.includes('TRIGGER:PT9H') && ics.includes('TRIGGER:-PT999H')); console.log('ok  Kalenderdatei: feste UID, Alarm 9 Uhr, Vorwarnung 42 Tage vorher');
assert(ics.includes('Zugang bis 30.11.2026\; falls\\, nötig') && ics.split('\r\n').every(z => z.length <= 75)); console.log('ok  Kalenderdatei: Sonderzeichen maskiert, Zeilen höchstens 75 Zeichen');
// Abgleich
let k = L.kalenderListe(S, T);
eq([k.neu.map(f => f.id), k.loeschen.length], [['t1', 'kb_v1'], 0], 'Kalender: 2 neu, 0 löschen');
S.fristen[0] = Object.assign({ id: 't1' }, L.kalMarkieren(S.fristen[0], k.neu[0])); S.fristen.push(Object.assign({ id: 'kb_v1' }, L.kalMarkieren(undefined, k.neu[1])));
k = L.kalenderListe(S, T);
eq([k.neu.length, k.loeschen.length, k.eingetragen.length], [0, 0, 2], 'nach dem Laden: beide eingetragen');
S.vertraege[0].laufzeitende = '2027-06-30'; // Nachtrag: neue Laufzeit
k = L.kalenderListe(S, T);
eq([k.neu.map(f => f.datum), k.loeschen.map(x => [x.datum, x.grund])], [['2027-05-19'], [['2027-02-17', 'Datum hat sich geändert']]], 'neue Laufzeit: 1 neu (19.05.2027), 1 löschen (17.02.2027)');
S.fristen[1] = Object.assign({ id: 'kb_v1' }, L.kalMarkieren(S.fristen[1], k.neu[0]));
k = L.kalenderListe(S, T);
eq([k.neu.length, k.loeschen.map(x => x.datum)], [0, ['2027-02-17']], 'neuer Termin geladen: der alte bleibt in der Löschliste');
S.fristen[1] = Object.assign({ id: 'kb_v1' }, L.kalGeloescht(S.fristen[1], '2027-02-17'));
eq(L.kalenderListe(S, T).loeschen.length, 0, 'alten Termin als gelöscht bestätigt: Liste leer');
S.vertraege[0].status = 'gekuendigt'; S.vertraege[0].gekuendigtAm = T; S.vertraege[0].bestaetigt = true;
eq(L.kalenderListe(S, T).loeschen.map(x => [x.datum, x.grund]), [['2027-05-19', 'Frist gibt es nicht mehr']], 'Kündigung: Kündigungsfrist im Kalender ist veraltet');
S.fristen[0].status = 'erledigt';
eq(L.kalenderListe(S, T).loeschen.map(x => x.grund), ['erledigt', 'Frist gibt es nicht mehr'], 'erledigter Termin: im Kalender löschen');
// Export und Sicherung
const t = L.exportTabellen(S, T);
eq(Object.keys(t), ['Verträge', 'Fassungen', 'Firmen', 'Dinge', 'Belege', '§35a', 'Termine', 'Dokumente', 'Schadenfälle', 'Zähler', 'Zeitleiste'], 'Excel: eine Tabelle je Bereich');
eq([t['Verträge'][0].Firma, t['Verträge'][0]['€/Monat'], t['§35a'][0]['20 %'], t['Belege'][0].Unbar], ['Beispiel AG', 10, 42, 'ja'], 'Excel: Namen statt IDs, Monatsbeitrag, §35a');
const b = L.sicherung(S, { d1: [{ id: 's001', nr: 1, text: 'Seite' }] }, T), imp = L.importOps(JSON.parse(JSON.stringify(b)));
eq([imp.zahl.vertraege, imp.zahl.fristen, imp.zahl.seiten, imp.ops.length], [1, 2, 1, 7], 'Sicherung → Import: alle Datensätze, Seiten und Einstellungen');
eq(imp.ops.find(o => o.pfad === 'vertraege/v1').data.kurzname, 'Hausrat', 'Import: Datensatz unter gleicher ID');
eq(L.importOps({ foo: 1 }).fehler, 'Das ist keine Sicherung der Haushalts-App.', 'Import: fremde Datei wird abgelehnt');
console.log('\nAlle Tests bestanden.');

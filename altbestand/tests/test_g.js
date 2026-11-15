const L = require('../haushalts-app/logic.js'); const assert = require('assert');
const eq = (a, b, n) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
const T = '2026-11-13';
const S = { fassungen: [], fristen: [{ id: 't1', titel: 'Heizungswartung', datum: '2026-11-30', status: 'offen', dingId: 'd1' }, { id: 'kb_v1', abgeleitet: true, kalTitel: 'Hausrat kündigen' }], ereignisse: [], schadenfaelle: [], zaehler: [],
  firmen: [{ id: 'f1', name: 'Beispiel Versicherung AG', hotline: '0800 111' }, { id: 'f2', name: 'Stadtwerke Beispiel', telefon: '069 222' }, { id: 'f3', name: 'Heizung Muster GmbH', art: 'Handwerker', hotline: '0171 333' }, { id: 'f4', name: 'Ohne Telefon AG' }],
  dinge: [{ id: 'd1', name: 'Heizung', kategorie: 'Haus', hersteller: 'Viessmann' }, { id: 'd2', name: 'Altes Auto', kategorie: 'Auto', status: 'verkauft' }],
  vertraege: [
    { id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', firmaId: 'f1', status: 'aktiv', beitrag: 120, zahlweise: 'jaehrlich', laufzeitende: '2027-06-30', fristWert: 3, fristEinheit: 'Monate', fuerWen: 'Familie', weitereRollen: ['Tochter'], dingId: 'd1' },
    { id: 'v2', kurzname: 'Strom', art: 'Strom/Gas', firmaId: 'f2', status: 'aktiv', beitrag: 90, zahlweise: 'monatlich', verlaengerung: 'unbefristet' },
    { id: 'v3', kurzname: 'Kfz alt', art: 'Versicherung', firmaId: 'f4', status: 'aktiv', laufzeitende: '2027-12-31', dingId: 'd2' },
    { id: 'v4', kurzname: 'Hausrat Angebot', art: 'Versicherung', firmaId: 'f4', status: 'angebot', beitrag: 9, zahlweise: 'monatlich', laufzeitende: '2027-12-31', fristWert: 1, fristEinheit: 'Monate', angelegt: '2026-06-01' },
    { id: 'v5', kurzname: 'Alt', art: 'Versicherung', status: 'beendet' }],
  dokumente: [{ id: 'p1', vertragId: 'v1', typ: 'Police', titel: 'Hausrat 2026', gueltigVon: '2026-01-01', seiten: 2, steckbrief: { gefahren: ['Feuer', 'Einbruch', 'Leitungswasser'], summen: [{ was: 'Hausrat', betrag: '65.000 €' }], selbstbeteiligung: '150 €', mitversichert: ['Tochter in WG'] } },
              { id: 'p2', vertragId: 'v4', typ: 'Angebot', titel: 'Angebot Hausrat', datum: '2026-06-01', gueltigVon: '2026-06-01', seiten: 1, steckbrief: { gefahren: ['Feuer', 'einbruch', 'Fahrraddiebstahl'], summen: [{ was: 'Hausrat', betrag: '80.000 €' }], selbstbeteiligung: '0 €' } },
              { id: 'p3', typ: 'Brief', titel: 'Loser Brief', seiten: 1 }],
  belege: [{ id: 'b1', titel: 'Wartung Heizung', datum: '2026-05-10', firmaId: 'f3', dingId: 'd1', betrag: 320, steuer: 'handwerker', unbar: true }, { id: 'b2', titel: 'Quittung', datum: '2026-03-01' }] };

// 2. Suche
eq(L.suche(S, 'hausrat').map(x => x.art + ':' + x.titel), ['Vertrag:Hausrat', 'Vertrag:Hausrat Angebot', 'Dokument:Hausrat 2026', 'Dokument:Angebot Hausrat'], 'Suche findet Verträge und Dokumente');
eq(L.suche(S, 'Heizung muster').map(x => x.titel), ['Heizung Muster GmbH', 'Wartung Heizung'], 'Suche: alle Wörter müssen vorkommen, auch über den Firmennamen');
eq(L.suche(S, 'viessmann')[0].col + L.suche(S, 'fahrraddiebstahl')[0].titel, 'dingeAngebot Hausrat', 'Suche in Hersteller und im Steckbrief');
eq([L.suche(S, 'x').length, L.suche(S, 'kündigen').length, L.suche(S, 'gibtesnicht').length], [0, 0, 0], 'Suche: zu kurz, interne Merker und Unbekanntes liefern nichts');
eq(L.sucheText(S, { p1: [{ nr: 2, text: 'Abschnitt A\n§ 3 Einbruchdiebstahl ist versichert bis zur Versicherungssumme.' }, { nr: 1, text: 'Deckblatt' }] }, 'einbruchdiebstahl versichert'), [{ col: 'dokumente', id: 'p1', titel: 'Hausrat 2026', seite: 2, ausschnitt: 'Abschnitt A § 3 Einbruchdiebstahl ist versichert bis zur Versicherungssumme.' }], 'Suche im Dokumenttext mit Seite und Ausschnitt');
// 4. Deckung
const d = L.deckung(S, T);
eq(d.map(x => [x.kurzname, x.hatSteckbrief]), [['Hausrat', true], ['Kfz alt', false]], 'Deckung: nur laufende Versicherungen, fehlender Steckbrief ist markiert');
eq([d[0].gefahren, d[0].selbstbeteiligung, d[0].fuerWen, d[0].mitversichert, d[0].hotline], [['Feuer', 'Einbruch', 'Leitungswasser'], '150 €', ['Familie', 'Tochter'], ['Tochter in WG'], '0800 111'], 'Deckung: Gefahren, Selbstbeteiligung, Rollen, Hotline');
// 5. Notfallblatt
const n = L.notfallDaten(S, {}, T);
eq([n.versicherungen.map(x => x.name + ' ' + x.hotline), n.vertraege.map(x => x.name + ' ' + x.hotline), n.firmen.map(x => x.name)], [['Hausrat 0800 111', 'Kfz alt '], ['Strom 069 222'], ['Heizung Muster GmbH']], 'Notfallblatt: Versicherungen, Verträge mit Telefon, übrige Firmen');
eq(JSON.stringify(n).includes('120') || JSON.stringify(n).includes('€'), false, 'Notfallblatt enthält keine Beträge');
// 8. Vergleich
const v = L.vergleich(S.vertraege[0], S.vertraege[3], S, T);
eq(v.zeilen.filter(z => !z.gleich).map(z => [z.label, z.a, z.b]), [['Status', 'aktiv', 'angebot'], ['Firma', 'Beispiel Versicherung AG', 'Ohne Telefon AG'], ['Beitrag je Monat', '10,00 €', '9,00 €'], ['Beitrag je Jahr', '120,00 €', '108,00 €'], ['Laufzeit bis', '30.06.2027', '31.12.2027'], ['Kündigungsfrist', '3 Monate', '1 Monat'], ['Selbstbeteiligung', '150 €', '0 €']], 'Vergleich: Zeilen mit Unterschied');
eq([v.listen[0].beide, v.listen[0].nurA, v.listen[0].nurB, v.differenzJahr], [['Feuer', 'Einbruch'], ['Leitungswasser'], ['Fahrraddiebstahl'], -12], 'Vergleich: nur im Vertrag, nur im Angebot (Groß-/Kleinschreibung egal), Differenz je Jahr');
// 9. Zähler
const st = [{ datum: '2025-01-01', wert: 1000 }, { datum: '2026-01-01', wert: 4650 }, { datum: '2026-07-01', wert: 6460 }, { datum: '2025-07-02', wert: 2820 }];
eq(L.standAmTag(st, '2026-01-01'), { wert: 4650, geschaetzt: false }, 'Zähler: Stand am Ablesetag');
eq(L.standAmTag(st, '2026-04-01'), { wert: 5550, geschaetzt: true }, 'Zähler: Stand zwischen zwei Ablesungen linear geschätzt');
eq([L.standAmTag(st, '2024-12-31'), L.standAmTag(st, '2026-07-02')], [null, null], 'Zähler: außerhalb der Ablesungen keine Schätzung');
eq(L.verbrauch(st, '2025-01-01', '2026-01-01'), { menge: 3650, tage: 365, geschaetzt: false }, 'Verbrauch im Abrechnungszeitraum');
eq(L.verbrauchJeJahr(st), [{ jahr: 2025, menge: 3650, tage: 365, ganz: true, geschaetzt: false }, { jahr: 2026, menge: 1810, tage: 181, ganz: false, geschaetzt: false }], 'Verbrauch je Jahr, laufendes Jahr als Teiljahr');
eq(L.ablesungen(st.concat([{ datum: '2026-08-01', wert: 12 }])).slice(0, 2).map(a => [a.datum, a.seit, a.jeTag, a.wechsel]), [['2026-08-01', -6448, null, true], ['2026-07-01', 1810, 10, false]], 'Ablesungen: Verbrauch je Tag, Zählerwechsel markiert');
// 10. Webadresse
eq(['beispiel.de/kunden', 'https://portal.beispiel.de/login?x=1', 'javascript:alert(1)', 'kein link', '', 'http://a.b/"x'].map(L.webAdresse), ['https://beispiel.de/kunden', 'https://portal.beispiel.de/login?x=1', null, null, null, null], 'Webadresse: https ergänzt, nur http(s), Unsinn abgelehnt');
// 11. Jahres-Check
eq(L.jahresBefunde(S, T).map(b => b.art + ' | ' + b.text.split(':')[0]), [
  'Vertrag ohne Beitrag | Kfz alt', 'Vertrag ohne Kündigungsfrist | Kfz alt', 'Versicherung ohne Steckbrief | Kfz alt',
  'Angebot älter als 3 Monate | Hausrat Angebot', 'Firma ohne Telefon oder Hotline | Ohne Telefon AG', 'Dokument ohne Zuordnung | Loser Brief', '§ 35a-Beleg unvollständig | Wartung Heizung', 'Beleg ohne Zuordnung | Quittung', 'Vertrag an verkauftem Ding | Kfz alt hängt an Altes Auto'], 'Jahres-Check: Befunde');
const js = L.jahresStand(S, { jahrescheck: { 2026: { v2: '2026-11-13' } } }, '2026');
eq([js.gesamt, js.erledigt, js.liste.map(x => x.kurzname + (x.angesehen ? ' ✓' : ''))], [3, 1, ['Hausrat', 'Kfz alt', 'Strom ✓']], 'Jahres-Check: Fortschritt über laufende Verträge');
eq(L.bereinigen({ dokument: { typ: 'Angebot' } }, { vertraege: [], dinge: [], firmen: [] }).dokument.typ, 'Angebot', 'Dokumenttyp Angebot wird erkannt');
console.log('\nAlle Tests bestanden.');

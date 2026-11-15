const L = require('../haushalts-app/logic.js'); const assert = require('assert');
const eq = (a, b, n) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
const T = '2026-11-12';
const leer = () => ({ vertraege: [], fassungen: [], fristen: [], belege: [], dinge: [], dokumente: [], ereignisse: [] });
/* kleine Test-Datenbank, die ops so anwendet wie die App */
function anwenden(S, ops) { let n = 0;
  for (const o of ops) { const col = S[o.col];
    if (o.op === 'add') col.push(Object.assign({ id: o.col + (++n) + '_' + col.length }, o.data));
    else if (o.op === 'set') { const i = col.findIndex(x => x.id === o.id); if (i >= 0) col[i] = Object.assign({ id: o.id }, o.data); else col.push(Object.assign({ id: o.id }, o.data)); }
    else { const x = col.find(x => x.id === o.id); Object.assign(x, o.data); for (const k of o.entfernen || []) delete x[k]; } } }

// 1. Verpasste Frist mit Fortschreibung
let S = leer(); S.vertraege.push({ id: 'v1', kurzname: 'Zeitschrift', art: 'Abo', status: 'aktiv', beitrag: 10, zahlweise: 'monatlich', laufzeitende: '2026-10-31', fristWert: 3, fristEinheit: 'Monate', verlaengerung: '12m', abschluss: '2024-11-01' });
anwenden(S, L.wartung(S, T));
eq(S.vertraege[0].laufzeitende, '2027-10-31', 'Verpasste Frist: Laufzeitende fortgeschrieben auf 31.10.2027');
eq(S.fassungen.map(f => [f.gueltigVon, f.gueltigBis || null, f.laufzeitende]), [['2024-11-01', '2026-10-31', '2026-10-31'], ['2026-11-01', null, '2027-10-31']], 'Fortschreibung: alte Fassung geschlossen, neue ab 01.11.2026');
eq(S.ereignisse[0].text, 'Frist 31.07.2026 verstrichen: verlängert bis 31.10.2027', 'Fortschreibung: Eintrag in der Zeitleiste');
eq(L.wartung(S, T), [], 'Fortschreibung läuft nicht doppelt');
eq(L.alleFristen(S).find(f => f.id === 'kb_v1').datum, '2027-07-31', 'neue Kündigungsfrist 31.07.2027');
S = leer(); S.vertraege.push({ id: 'v2', kurzname: 'Strom', art: 'Strom/Gas', status: 'aktiv', laufzeitende: '2026-09-30', fristWert: 1, fristEinheit: 'Monate', verlaengerung: 'unbefristet' });
anwenden(S, L.wartung(S, T));
eq([S.vertraege[0].laufzeitende, S.vertraege[0].erstlaufzeitEnde, L.jederzeit(S.vertraege[0])], [undefined, '2026-09-30', true], 'Verpasste Frist bei Verbrauchervertrag: jetzt unbefristet, jederzeit kündbar');

// 2. Kündigung ohne Bestätigung
S = leer(); S.dinge.push({ id: 'd1', name: 'Kombi', kategorie: 'Auto' });
S.vertraege.push({ id: 'k1', kurzname: 'Kfz Kombi', art: 'Versicherung', dingId: 'd1', status: 'aktiv', beitrag: 600, zahlweise: 'jaehrlich', laufzeitende: '2026-12-31', fristWert: 1, fristEinheit: 'Monate', verlaengerung: '12m' });
let r = L.ereignisFolgen('kuendigung', S.vertraege[0], { am: '2026-11-12' }, S, T); anwenden(S, r.ops);
eq([S.vertraege[0].status, S.vertraege[0].gekuendigtZum, S.vertraege[0].bestaetigt], ['gekuendigt', '2026-12-31', false], 'Kündigung versendet: Status gekündigt zum 31.12.2026');
eq(L.alleFristen(S).some(f => f.id === 'kb_k1'), false, 'Kündigung: Kündigungsfrist ist erledigt');
eq(L.alleFristen(S).filter(f => f.vertragId === 'k1').map(f => [f.id.split('_')[0], f.datum]), [['best', '2026-11-26'], ['ersatz', '2026-12-31'], ['fristen1', '2027-01-30']], 'Kündigung: Bestätigung da? (+14 Tage), Ersatz fehlt (Kfz), Abbuchung prüfen');
eq(r.hinweise.some(h => h.startsWith('Ersatz nötig')), true, 'Kündigung Kfz: Warnung Ersatz nötig');
eq(L.wichtig(S, '2026-11-30', 42).map(f => f.id.split('_')[0]), ['best', 'ersatz'], 'Kündigung ohne Bestätigung steht in Jetzt wichtig');
r = L.ereignisFolgen('bestaetigung', S.vertraege[0], { zum: '2026-12-31' }, S, T); anwenden(S, r.ops);
eq(L.alleFristen(S).some(f => f.id === 'best_k1'), false, 'Bestätigung: Erinnerung verschwindet, Enddatum fix');
eq(L.ereignisFolgen('kuendigung', { id: 'x', kurzname: 'X', art: 'Abo', status: 'aktiv', laufzeitende: '2026-12-31', fristWert: 3, fristEinheit: 'Monate' }, { am: T }, leer(), T).hinweise.some(h => h.startsWith('Achtung: Die Frist 30.09.2026')), true, 'Kündigung nach Fristablauf: Warnung');

// 3. Ersatz mit Lücke, Überschneidung, nahtlos
S.vertraege.push({ id: 'k2', kurzname: 'Kfz neu', art: 'Versicherung', dingId: 'd1', status: 'aktiv', beginn: '2027-01-05' });
r = L.ereignisFolgen('ersatz', S.vertraege[0], { ersatzId: 'k2' }, S, T); anwenden(S, r.ops);
eq(r.hinweise[0], 'Lücke: vom 01.01.2027 bis 04.01.2027 besteht kein Vertrag (4 Tage).', 'Ersatz mit Lücke erkannt');
eq(L.wichtig(S, T, 42).map(f => f.id), ['luecke_k1'], 'Lücke steht in Jetzt wichtig, „Ersatz fehlt“ ist weg');
eq(L.lueckePruefung(S.vertraege[0], { beginn: '2026-12-15' }).text, 'Überschneidung: vom 15.12.2026 bis 31.12.2026 laufen beide Verträge (17 Tage).', 'Ersatz mit Überschneidung');
eq(L.lueckePruefung(S.vertraege[0], { beginn: '2027-01-01' }).art, 'nahtlos', 'Ersatz nahtlos');
anwenden(S, L.wartung(S, '2027-01-02'));
eq([S.vertraege[0].status, L.fixkosten(S.vertraege, S.fassungen, '2027-01-02').monat], ['ersetzt', 0], 'Vertragsende: Status ersetzt, raus aus den Fixkosten');

// 4. Beitragserhöhung und Fassung am Stichtag (Schaden in alter Fassung)
S = leer(); S.vertraege.push({ id: 'h1', kurzname: 'Hausrat', art: 'Versicherung', status: 'aktiv', beitrag: 120, zahlweise: 'jaehrlich', laufzeitende: '2027-06-30', fristWert: 3, fristEinheit: 'Monate', verlaengerung: '12m', abschluss: '2020-07-01' });
S.dokumente.push({ id: 'p1', vertragId: 'h1', gueltigVon: '2020-07-01', gueltigBis: '2026-12-31', steckbrief: { gefahren: ['Feuer'] } }, { id: 'p2', vertragId: 'h1', gueltigVon: '2027-01-01', steckbrief: { gefahren: ['Feuer', 'Elementar'] } });
r = L.ereignisFolgen('erhoehung', S.vertraege[0], { beitrag: 150, gueltigAb: '2027-01-01', zugang: '2026-11-10' }, S, T); anwenden(S, r.ops);
eq(r.hinweise[0], 'Vergleich: alt 10,00 €, neu 12,50 € pro Monat (+2,50 €, +25,0 %). Fixkosten rechnen ab 01.01.2027 mit dem neuen Beitrag.', 'Beitragserhöhung: Vergleich alt/neu');
eq(S.fristen[0].datum, '2026-12-10', 'Beitragserhöhung: Sonderkündigung bis 1 Monat nach Zugang (10.12.2026)');
eq([L.fixkosten(S.vertraege, S.fassungen, T).monat, L.fixkosten(S.vertraege, S.fassungen, '2027-01-01').monat], [10, 12.5], 'Fixkosten: bis 31.12. alter, ab 01.01. neuer Beitrag');
eq([L.standAm(S.vertraege[0], S.fassungen, '2026-08-15').beitrag, L.steckbriefAm('h1', S.dokumente, '2026-08-15').id], [120, 'p1'], 'Schaden am 15.08.2026: alte Fassung und alter Steckbrief');
eq([L.standAm(S.vertraege[0], S.fassungen, '2027-02-01').beitrag, L.steckbriefAm('h1', S.dokumente, '2027-02-01').id], [150, 'p2'], 'Schaden am 01.02.2027: neue Fassung und neuer Steckbrief');
r = L.ereignisFolgen('nachtrag', S.vertraege[0], { gueltigAb: '2027-03-01', laufzeitende: '2028-02-29', beitrag: 150, zahlweise: 'jaehrlich', fristWert: 1, fristEinheit: 'Monate', verlaengerung: '12m' }, S, T); anwenden(S, r.ops);
eq(r.hinweise.find(h => h.startsWith('Neue Laufzeit')), 'Neue Laufzeit: bis 29.02.2028, kündigen bis 31.01.2028 (vorher 31.03.2027). Der alte Kalendertermin ist damit veraltet.', 'Nachtrag: Hinweis bei neuer Laufzeit');
eq(S.fassungen.filter(f => !f.gueltigBis).length, 1, 'immer genau eine offene Fassung');

// 5. Ding verkauft, Lebensereignis, Kündigungsentwurf
S = leer(); S.dinge.push({ id: 'd1', name: 'Kombi', kategorie: 'Auto', status: 'verkauft' }); S.vertraege.push({ id: 'k1', kurzname: 'Kfz Kombi', art: 'Versicherung', dingId: 'd1', status: 'aktiv' }, { id: 't1', kurzname: 'Handy Tochter', art: 'Handy/Internet', fuerWen: 'Tochter', status: 'aktiv' });
eq(L.dingFolgen(S.dinge[0], 'aktiv', S, T).hinweise, ['Neuer Termin am 19.11.2026: Prüfen: Kfz Kombi nach Verkauf von Kombi'], 'Ding verkauft: Vertrag zur Prüfung vorgelegt');
eq(L.dingFolgen(S.dinge[0], 'verkauft', S, T).ops, [], 'Ding schon verkauft: keine neuen Aufgaben');
eq(L.lebensFolgen('studienende', '2027-03-31', S, T).hinweise.length, 4, 'Studium endet: 3 Aufgaben plus Vertrag der Tochter');
assert(L.kuendigungsText({ kurzname: 'Hausrat', laufzeitende: '2026-12-31' }, { name: 'Beispiel AG' }, T).includes('ordentlich zum 31.12.2026, hilfsweise zum nächstmöglichen Termin')); console.log('ok  Kündigungsentwurf mit Platzhaltern');
// Flexibilität: eigene Werte, eigene Lebensereignisse, wiederkehrende Termine, eigener Vorlauf
let e = L.mitEigenem({ vorlauf: 42 }, 'dingKat', ' Fahrrad ');
eq(e.eigene, { dingKat: ['Fahrrad'] }, 'eigener Wert wird in die Einstellungen aufgenommen');
eq([L.mitEigenem(e, 'dingKat', 'fahrrad'), L.mitEigenem(e, 'dingKat', 'Haus'), L.mitEigenem(e, 'gibtsnicht', 'x'), L.mitEigenem(e, 'rolle', '')], [null, null, null, null], 'doppelte, eingebaute, unbekannte und leere Werte werden nicht doppelt angelegt');
L.setEigene({ dingKat: ['Fahrrad'], rolle: ['Großmutter'], typ: ['Kaufvertrag'] });
eq([L.ENUM.dingKat.slice(-2), L.ENUM.rolle.slice(-1), L.ENUM.typ.includes('Kaufvertrag')], [['Wertsache', 'Fahrrad'], ['Großmutter'], true], 'eigene Werte stehen in den Auswahllisten');
eq(L.bereinigen({ dokument: { typ: 'Kaufvertrag' }, vertrag: { fuerWen: 'Großmutter' } }, { vertraege: [], dinge: [], firmen: [] }).dokument.typ, 'Kaufvertrag', 'eigener Dokumenttyp wird auch beim Auslesen akzeptiert');
L.setEigene({});
eq(L.ENUM.dingKat, ['Haus', 'Auto', 'Gerät', 'Wertsache'], 'ohne eigene Werte gelten wieder die eingebauten');
const einst = { leben: { versteckt: ['geburtstag25'], eigene: [{ id: 'e1', name: 'Kind 2 wird 18', rolle: 'Kind 2', aufgaben: ['Kindergeld: Antrag ab 18 prüfen [prüfen]', 'Eigenes Konto und Haftpflicht prüfen'] }] } };
eq(L.lebenListe(einst).map(x => [x.key, x.eigen]), [['umzug', false], ['studienende', false], ['autoverkauf', false], ['e1', true]], 'Lebensereignisse: ausgeblendetes fehlt, eigenes ist dabei');
eq(L.lebenListe({}).length, 4, 'ohne Anpassung: die vier eingebauten');
S.vertraege.push({ id: 'k2', kurzname: 'Konto Kind 2', art: 'Sonstiges', fuerWen: 'Kind 2', status: 'aktiv' });
eq(L.lebensFolgen(L.lebenListe(einst)[3], '2028-05-01', S, T).hinweise, ['Aufgabe zum 01.05.2028: Kind 2 wird 18: Kindergeld: Antrag ab 18 prüfen [prüfen]', 'Aufgabe zum 01.05.2028: Kind 2 wird 18: Eigenes Konto und Haftpflicht prüfen', 'Aufgabe zum 01.05.2028: Kind 2 wird 18: Vertrag „Konto Kind 2“ prüfen'], 'eigenes Lebensereignis legt seine Aufgaben und die Verträge der Rolle an');
eq(L.naechsterTermin({ id: 't', titel: 'Heizungswartung', datum: '2026-11-30', status: 'erledigt', wiederholung: '12', kalDatum: '2026-11-30', dingId: 'd1' }), { titel: 'Heizungswartung', datum: '2027-11-30', status: 'offen', wiederholung: '12', dingId: 'd1' }, 'wiederkehrender Termin: nächster in 12 Monaten, ohne Kalendervermerk');
eq([L.naechsterTermin({ datum: '2026-01-31', wiederholung: '1' }).datum, L.naechsterTermin({ datum: '2026-01-31' })], ['2026-02-28', null], 'monatlich am 31. → 28.02.; ohne Wiederholung kein neuer Termin');
const SV = { fristen: [{ id: 'a', titel: 'HU', datum: '2027-03-01', status: 'offen', vorlaufTage: 120 }, { id: 'b', titel: 'Wartung', datum: '2027-03-01', status: 'offen' }], vertraege: [], belege: [], dinge: [] };
eq(L.wichtig(SV, T, 42).map(f => f.id), ['a'], 'eigener Vorlauf von 120 Tagen: Termin erscheint früher als mit dem Standard');
console.log('\nAlle Tests bestanden.');
assert.strictEqual(L.istVers({ art: 'Fahrradversicherung' }) && L.istVers({ art: 'Versicherung' }) && !L.istVers({ art: 'Abo' }) && !L.istVers({}), true);
assert.deepStrictEqual(L.schadenPolicen({ vertraege: [{ id: 'x', kurzname: 'E-Bike', art: 'Fahrradversicherung', status: 'aktiv' }], fassungen: [], firmen: [], dokumente: [] }, T).map(p => p.kurzname), ['E-Bike']);
console.log('ok  eigene Art mit „versicherung“ im Namen zählt als Versicherung (Liste, Schadenfall)');

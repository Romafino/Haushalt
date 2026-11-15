const L = require('../haushalts-app/logic.js');
const assert = require('assert');
const eq = (a, b, name) => { assert.deepStrictEqual(a, b, name); console.log('ok  ' + name + ' → ' + JSON.stringify(a)); };

eq(L.kuendigenBis('2026-12-31', 1, 'Monate'), '2026-11-30', '31.12.2026 mit 1 Monat');
eq(L.kuendigenBis('2027-03-31', 6, 'Wochen'), '2027-02-17', '31.03.2027 mit 6 Wochen');
eq(L.kuendigenBis('2026-11-30', 1, 'Monate'), '2026-10-31', '30.11. mit 1 Monat (Monatsende)');
eq(L.kuendigenBis('2027-02-28', 3, 'Monate'), '2026-11-30', '28.02.2027 mit 3 Monaten');
eq(L.kuendigenBis('2027-03-15', 1, 'Monate'), '2027-02-15', '15.03. mit 1 Monat');
eq(L.kuendigenBis('2026-12-31', 30, 'Tage'), '2026-12-01', '31.12. mit 30 Tagen');

const v = { status: 'aktiv', laufzeitende: '2026-10-31', fristWert: 3, fristEinheit: 'Monate', verlaengerung: '12m' };
eq(L.fortschreiben(v, '2026-11-12').laufzeitende, '2027-10-31', 'verpasste Frist, +12 Monate');
eq(L.fortschreiben({ ...v, laufzeitende: '2024-02-29' }, '2026-11-12').laufzeitende, '2027-02-28', 'mehrfach verpasst, Schaltjahr');
eq(L.fortschreiben({ ...v, verlaengerung: 'unbefristet' }, '2026-11-12').laufzeitende, null, 'verpasste Frist, danach unbefristet');
eq(L.fortschreiben({ ...v, laufzeitende: '2027-12-31' }, '2026-11-12'), null, 'Frist noch offen: keine Fortschreibung');
eq(L.fortschreiben({ ...v, status: 'gekuendigt' }, '2026-11-12'), null, 'gekündigt: keine Fortschreibung');

eq(L.fixkosten([{ status: 'aktiv', beitrag: 120, zahlweise: 'jaehrlich' }, { status: 'gekuendigt', beitrag: 30, zahlweise: 'monatlich' }, { status: 'beendet', beitrag: 99, zahlweise: 'monatlich' }]), { monat: 40, jahr: 480 }, 'Fixkosten ohne beendete Verträge');

const bel = [
  { datum: '2026-05-10', steuer: 'handwerker', arbeitskosten: 5000, unbar: true },
  { datum: '2026-06-01', steuer: 'handwerker', arbeitskosten: 2000, unbar: true },
  { datum: '2026-07-01', steuer: 'handwerker', arbeitskosten: 500, unbar: false },
  { datum: '2025-07-01', steuer: 'handwerker', arbeitskosten: 900, unbar: true },
];
const s = L.steuer35a(bel, 2026).handwerker;
eq([s.arbeit, s.anrechenbar, s.ermaessigung, s.bar], [7500, 7000, 1200, 1], '§35a 2026: Deckel 1.200 €, bar bezahlt zählt nicht');
eq(L.gewBis({ datum: '2026-03-15', gewArt: 'bauwerk', uebergabe: '2026-04-01' }), '2031-04-01', 'Gewährleistung Bauwerk 5 Jahre ab Abnahme');

const S = {
  fristen: [{ id: 'f1', titel: 'Kfz', datum: '2026-11-20', status: 'offen' }, { id: 'f2', titel: 'spät', datum: '2027-06-01', status: 'offen' }],
  vertraege: [{ id: 'v1', kurzname: 'Strom', status: 'gekuendigt', gekuendigtAm: '2026-10-01', laufzeitende: '2026-12-31' },
              { id: 'v2', kurzname: 'Hausrat', status: 'aktiv', laufzeitende: '2026-12-31', fristWert: 1, fristEinheit: 'Monate' }],
  belege: [],
};
eq(L.wichtig(S, '2026-11-12', 42).map(f => f.id), ['best_v1', 'f1', 'kb_v2'], 'Jetzt wichtig: Kündigung ohne Bestätigung, Termin, Kündigungsfrist');
console.log('\nAlle Tests bestanden.');

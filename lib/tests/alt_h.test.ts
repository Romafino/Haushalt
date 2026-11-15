/* Übertragen aus altbestand/tests/test_h.js. Prüfungen unverändert; läuft gegen lib/regeln und lib/schwaerzen. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert';
import { test } from 'vitest';
import * as R from '@/lib/regeln';
import * as SW from '@/lib/schwaerzen';
const L: any = { ...R, ...SW };

test('Altbestand h', async () => {
  const eq = (a: any, b: any, n: any) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
  const T = '2026-11-13';
  // gemeldeter Fall: Strom, Erstlaufzeit bis 04.06.2026 vorbei, danach unbefristet mit 4 Wochen
  const strom = { id: 's', kurzname: 'Strom', art: 'Strom/Gas', status: 'aktiv', beginn: '2025-06-05', laufzeitende: '2026-06-04', fristWert: 4, fristEinheit: 'Wochen', verlaengerung: 'unbefristet' };
  let k = L.kuendigungJetzt(strom, T);
  eq([k.art, k.zum, k.erstlaufzeitEnde, k.verpasst], ['jederzeit', '2026-12-11', '2026-06-04', '2026-05-07'], 'gemeldeter Fall: jederzeit kündbar, Zugang 13.11. → Ende 11.12.2026 (4 Wochen)');
  eq(k.text, 'Geht die Kündigung heute (13.11.2026) beim Anbieter ein, endet der Vertrag am 11.12.2026 (4 Wochen ab Zugang).', 'Rechenweg ab heute');
  const S = { vertraege: [strom], fristen: [], belege: [], dinge: [] };
  eq(L.alleFristen(S, T).filter((f: any) => f.vertragId === 's'), [], 'keine überfällige Kündigungsfrist mehr in „Jetzt wichtig“');
  eq(L.kuendigungsText(strom, null, T).includes('ordentlich zum nächstmöglichen Termin.'), true, 'Kündigungsentwurf: „zum nächstmöglichen Termin“ statt des alten Datums');
  eq(L.exportTabellen(Object.assign({ firmen: [], fassungen: [], dokumente: [], ereignisse: [], schadenfaelle: [] }, S), T)['Verträge'][0]['Kündigen bis'], 'jederzeit, Ende frühestens 2026-12-11', 'Excel zeigt die aktuelle Lage');
  // nach der automatischen Umstellung (ohne Laufzeitende) dasselbe Ergebnis
  const umgestellt: any = Object.assign({}, strom, { erstlaufzeitEnde: '2026-06-04' }); delete umgestellt.laufzeitende;
  eq([L.kuendigungJetzt(umgestellt, T).zum, L.kuendigungJetzt(umgestellt, T).erstlaufzeitEnde], ['2026-12-11', '2026-06-04'], 'nach der Umstellung: gleiches Ergebnis');
  // Monate und Tage ab Zugang
  eq([L.kuendigungJetzt(Object.assign({}, umgestellt, { fristWert: 1, fristEinheit: 'Monate' }), '2026-01-31').zum, L.kuendigungJetzt(Object.assign({}, umgestellt, { fristWert: 14, fristEinheit: 'Tage' }), T).zum], ['2026-02-28', '2026-11-27'], 'jederzeit mit 1 Monat (31.01. → 28.02.) bzw. 14 Tagen');
  eq(L.kuendigungJetzt(Object.assign({}, umgestellt, { fristWert: undefined }), T).text.startsWith('Jederzeit kündbar. Die Kündigungsfrist fehlt'), true, 'jederzeit ohne eingetragene Frist: Hinweis');
  // Termin noch offen
  eq(L.kuendigungJetzt({ status: 'aktiv', laufzeitende: '2026-12-31', fristWert: 1, fristEinheit: 'Monate', verlaengerung: '12m' }, T), { art: 'termin', bis: '2026-11-30', zum: '2026-12-31', text: 'Letzter Vertragstag 31.12.2026 − 1 Monat → Kündigung muss spätestens am 30.11.2026 beim Anbieter eingegangen sein.' }, 'Frist noch offen: Termin wie bisher');
  // verpasst mit +12 Monaten: sofort der neue Termin
  k = L.kuendigungJetzt({ kurzname: 'Abo', status: 'aktiv', laufzeitende: '2026-10-31', fristWert: 3, fristEinheit: 'Monate', verlaengerung: '12m' }, T);
  eq([k.art, k.bis, k.zum, k.verpasst], ['termin', '2027-07-31', '2027-10-31', '2026-07-31'], 'verpasst mit +12 Monaten: sofort der neue Termin 31.07.2027');
  // verpasst, Verlängerung laut Vertrag: unklar, quittierbar
  const unkl = { id: 'u', kurzname: 'Wartung', status: 'aktiv', laufzeitende: '2026-10-31', fristWert: 1, fristEinheit: 'Monate', verlaengerung: 'vertrag' };
  eq([L.kuendigungJetzt(unkl, T).art, L.alleFristen({ vertraege: [unkl], fristen: [], belege: [] }, T)[0].titel], ['unklar', 'Wartung: Kündigungsfrist verstrichen, Verlängerung prüfen'], 'verpasst, Verlängerung laut Vertrag: als unklar gemeldet');
  eq([L.kuendigungJetzt({ status: 'gekuendigt', laufzeitende: '2026-12-31', fristWert: 1 }, T), L.kuendigungJetzt({ status: 'angebot' }, T)], [null, null], 'gekündigte Verträge und Angebote: keine Kündigungsfrist');
  console.log('\nAlle Tests bestanden.');
});

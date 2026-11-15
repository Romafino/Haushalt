/* Übertragen aus altbestand/tests/test_d.js. Prüfungen unverändert; läuft gegen lib/regeln und lib/schwaerzen. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert';
import { test } from 'vitest';
import * as R from '@/lib/regeln';
import * as SW from '@/lib/schwaerzen';
const L: any = { ...R, ...SW };

test('Altbestand d', async () => {
  const eq = (a: any, b: any, n: any) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
  const H = '2026-11-12';
  const S = { firmen: [{ id: 'f1', name: 'Beispiel AG', hotline: '0800 111' }], dinge: [{ id: 'd1', name: 'Haus', kategorie: 'Haus' }], belege: [], fristen: [], ereignisse: [],
    vertraege: [
      { id: 'h1', kurzname: 'Hausrat', art: 'Versicherung', firmaId: 'f1', status: 'aktiv', beitrag: 150, zahlweise: 'jaehrlich', laufzeitende: '2027-06-30', fristWert: 3, fristEinheit: 'Monate', abschluss: '2020-07-01' },
      { id: 'w1', kurzname: 'Wohngebäude alt', art: 'Versicherung', status: 'beendet', gekuendigtZum: '2025-12-31', abschluss: '2015-01-01' },
      { id: 'w2', kurzname: 'Wohngebäude neu', art: 'Versicherung', status: 'aktiv', beginn: '2026-01-01', abschluss: '2025-11-01' },
      { id: 'r1', kurzname: 'Rechtsschutz', art: 'Versicherung', status: 'angebot' },
      { id: 'g1', kurzname: 'Glas', art: 'Versicherung', status: 'gekuendigt', gekuendigtZum: '2026-12-31', abschluss: '2019-01-01' },
      { id: 's1', kurzname: 'Strom', art: 'Strom/Gas', status: 'aktiv', beitrag: 90, zahlweise: 'monatlich' }],
    fassungen: [{ id: 'a', vertragId: 'h1', gueltigVon: '2020-07-01', gueltigBis: '2026-08-31', beitrag: 120, zahlweise: 'jaehrlich', laufzeitende: '2027-06-30', fristWert: 3, fristEinheit: 'Monate' }, { id: 'b', vertragId: 'h1', gueltigVon: '2026-09-01', beitrag: 150, zahlweise: 'jaehrlich', laufzeitende: '2027-06-30', fristWert: 3, fristEinheit: 'Monate' }],
    dokumente: [
      { id: 'p1', vertragId: 'h1', typ: 'Police', titel: 'Hausrat 2020', gueltigVon: '2020-07-01', gueltigBis: '2026-08-31', seiten: 4, steckbrief: { gefahren: ['Feuer', 'Einbruch'], fundstellen: [{ thema: 'Einbruch', seite: 2, klausel: '§ 3' }] } },
      { id: 'p2', vertragId: 'h1', typ: 'Nachtrag', titel: 'Hausrat 2026', gueltigVon: '2026-09-01', seiten: 5, steckbrief: { gefahren: ['Feuer', 'Einbruch', 'Fahrraddiebstahl'] } },
      { id: 'p3', vertragId: 'w1', typ: 'Police', titel: 'Wohngebäude alt', gueltigVon: '2015-01-01', seiten: 6, steckbrief: { gefahren: ['Feuer', 'Leitungswasser', 'Sturm'] } }] };

  // Frage nur über aktive Verträge
  let k = L.akteKontext(S, H, H);
  eq(k.inKraft.map((x: any) => x.vertrag), ['Hausrat', 'Wohngebäude neu', 'Glas', 'Strom'], 'Frage ohne Datum: nur laufende Verträge gelten als in Kraft (gekündigt zählt bis zum Ende)');
  eq(k.nichtInKraft.map((x: any) => [x.vertrag, x.status]), [['Wohngebäude alt', 'beendet'], ['Rechtsschutz', 'angebot']], 'beendeter Vertrag und Angebot stehen getrennt, ohne Steckbrief');
  eq(JSON.stringify(k).includes('Leitungswasser'), false, 'Steckbrief des beendeten Vertrags geht NICHT an Claude');
  eq(k.inKraft[0].steckbrief.gefahren, ['Feuer', 'Einbruch', 'Fahrraddiebstahl'], 'aktuelle Fassung des Steckbriefs');
  eq(k.inKraft[1].steckbrief, null, 'Versicherung ohne Steckbrief: als null gekennzeichnet (unklar, nicht „nicht versichert“)');
  eq([k.inKraft[0].beitragProMonat, k.inKraft[0].kuendigenBis, k.inKraft[0].hotline], [12.5, '2027-03-31', '0800 111'], 'Kosten, Kündigungsfrist und Hotline im Kontext');
  // Frage zu einem Datum
  k = L.akteKontext(S, '2025-06-15', H);
  eq(k.inKraft.map((x: any) => x.vertrag), ['Hausrat', 'Wohngebäude alt', 'Glas', 'Strom'], 'Frage zum 15.06.2025: damals galt der alte Wohngebäude-Vertrag, der neue noch nicht');
  eq([k.inKraft[0].steckbrief.dokument, k.inKraft[0].beitragProMonat, JSON.stringify(k).includes('Fahrraddiebstahl')], ['Hausrat 2020', 10, false], 'Frage zum 15.06.2025: damalige Fassung, damaliger Beitrag');
  // Schritt 1 absichern
  eq(L.seitenWunsch({ stichtag: '15.06.2025', seiten: [{ dokumentId: 'p1', seiten: [2, 2, 9, 0, '3'] }, { dokumentId: 'gibtsnicht', seiten: [1] }] }, S, H), { stichtag: H, seiten: [{ dokumentId: 'p1', titel: 'Hausrat 2020', seiten: [2, 3] }] }, 'Seitenwunsch: falsches Datum → heute, nur vorhandene Dokumente und Seiten');
  eq(L.seitenWunsch({ seiten: [{ dokumentId: 'p3', seiten: [1, 2, 3, 4, 5, 6] }, { dokumentId: 'p2', seiten: [1, 2, 3, 4, 5] }, { dokumentId: 'p1', seiten: [1, 2, 3, 4] }] }, S, H).seiten.reduce((n: any, x: any) => n + x.seiten.length, 0), 12, 'Seitenwunsch: höchstens 12 Seiten');
  eq(L.seitenWunsch(null, S, H), { stichtag: H, seiten: [] }, 'Seitenwunsch: leere Antwort ist unschädlich');
  // Schaden in alter Fassung
  const p = L.schadenPolicen(S, '2026-08-15');
  eq(p.map((x: any) => [x.kurzname, x.dokument, x.fassungVon]), [['Hausrat', 'Hausrat 2020', '2020-07-01'], ['Wohngebäude neu', null, null], ['Glas', null, null]], 'Schaden am 15.08.2026: alte Hausrat-Fassung; beendete und angebotene Police fehlen');
  eq(L.schadenPolicen(S, '2026-10-01')[0].dokument, 'Hausrat 2026', 'Schaden am 01.10.2026: neue Fassung');
  eq(L.schadenPolicen(S, '2025-03-01').map((x: any) => x.kurzname), ['Hausrat', 'Wohngebäude alt', 'Glas'], 'Schaden am 01.03.2025: der damals laufende Altvertrag wird geprüft');
  let e = L.schadenErgebnis(p, { policen: [{ vertragId: 'h1', greift: 'nein', begruendung: 'Fahrrad nicht genannt.' }, { vertragId: 'fremd', greift: 'ja' }] });
  eq(e.map((x: any) => [x.kurzname, x.greift]), [['Hausrat', 'unklar'], ['Wohngebäude neu', 'unklar'], ['Glas', 'unklar']], '„nein“ ohne Fundstelle wird „unklar“; Police ohne Steckbrief ist „unklar“; fremde Einträge fallen weg');
  e = L.schadenErgebnis(p, { policen: [{ vertragId: 'h1', greift: 'nein', begruendung: 'Ausgeschlossen.', fundstellen: [{ seite: 3, klausel: '§ 5 Nr. 2' }], ausschluesse: ['Fahrräder außerhalb der Wohnung'], pflichten: ['Anzeige bei der Polizei'], selbstbeteiligung: '150 €' }] });
  eq([e[0].greift, e[0].fundstellen, e[0].hotline, e[0].selbstbeteiligung], ['nein', [{ seite: 3, klausel: '§ 5 Nr. 2' }], '0800 111', '150 €'], '„nein“ mit Fundstelle bleibt, Meldeweg kommt aus der Firma');
  console.log('\nAlle Tests bestanden.');
  { const p = L.schadenPolicen({ vertraege: [{ id: 'k', kurzname: 'Kfz', art: 'Versicherung', status: 'aktiv' }], fassungen: [], firmen: [], dokumente: [{ id: 'd', vertragId: 'k', gueltigVon: '2020-01-01', steckbrief: { gefahren: ['Haftpflicht'] } }] }, '2026-11-01');
    assert.strictEqual(L.schadenErgebnis(p, { policen: [{ vertragId: 'k', greift: 'nein', andereSparte: true, begruendung: 'Kfz-Police, Schaden am Haus.' }] })[0].greift, 'nein'); console.log('ok  „nein“ wegen anderer Sparte bleibt'); }
});

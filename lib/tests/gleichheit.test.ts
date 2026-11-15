/* Vergleich Altbestand ↔ neue Module: gleiche Eingaben müssen gleiche Ergebnisse liefern.
   Sichert die Übernahme aus altbestand/haushalts-app/logic.js und altbestand/schwaerzer/such.js ab.
   Alle Testdaten sind erfunden. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as R from '@/lib/regeln';
import * as SW from '@/lib/schwaerzen';

const require = createRequire(import.meta.url);
const ALT: any = require('../../altbestand/haushalts-app/logic.js');
const ALT_SU: any = require('../../altbestand/schwaerzer/such.js');
const NEU: any = { ...R, ...SW };

// Kleiner, fester Zufallsgenerator, damit der Test immer gleich läuft.
let saat = 20261115;
const zufall = () => ((saat = (saat * 1103515245 + 12345) % 2147483648) / 2147483648);
const wahl = <T,>(l: T[]): T => l[Math.floor(zufall() * l.length)];
const datum = () => {
  const j = 2020 + Math.floor(zufall() * 10), m = 1 + Math.floor(zufall() * 12);
  const max = new Date(Date.UTC(j, m, 0)).getUTCDate(), t = 1 + Math.floor(zufall() * max);
  return `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
};
const vertrag = (i: number) => ({
  id: 'v' + i, kurzname: wahl(['Hausrat', 'Kfz', 'Strom', 'Handy', 'Wohngebäude']) + i,
  art: wahl(['Versicherung', 'Strom/Gas', 'Handy/Internet', 'Abo', 'Fahrradversicherung']),
  status: wahl(['aktiv', 'aktiv', 'aktiv', 'gekuendigt', 'beendet', 'angebot']),
  beitrag: Math.round(zufall() * 2000) / 10, zahlweise: wahl(['monatlich', 'jaehrlich', 'vierteljaehrlich', 'woechentlich', 'einmalig', 'vierzehntaegig']),
  laufzeitende: zufall() < 0.8 ? datum() : undefined, fristWert: wahl([0, 1, 3, 4, 6, 30]), fristEinheit: wahl(['Monate', 'Wochen', 'Tage']),
  verlaengerung: wahl(['12m', 'unbefristet', 'vertrag', undefined]), beginn: zufall() < 0.5 ? datum() : undefined,
  gekuendigtAm: zufall() < 0.3 ? datum() : undefined, gekuendigtZum: zufall() < 0.3 ? datum() : undefined, bestaetigt: zufall() < 0.5,
});

describe('Altbestand und neue Module liefern dasselbe', () => {
  it('jede Funktion und Konstante des Altbestands gibt es auch neu', () => {
    for (const k of Object.keys(ALT)) expect(NEU, k).toHaveProperty(k);
    for (const k of Object.keys(ALT_SU)) expect(SW, k).toHaveProperty(k);
  });

  it('Datumsrechnung, Fristen, Kündigung heute, Fortschreiben (2.000 Fälle)', () => {
    for (let i = 0; i < 2000; i++) {
      const v = vertrag(i), tag = datum(), w = wahl([1, 2, 3, 6, 12, 30]), e = wahl(['Monate', 'Wochen', 'Tage']), d = datum();
      expect(NEU.addMonths(d, w - 6)).toBe(ALT.addMonths(d, w - 6));
      expect(NEU.kuendigenBis(d, w, e)).toBe(ALT.kuendigenBis(d, w, e));
      expect(NEU.rechenweg(d, w, e)).toBe(ALT.rechenweg(d, w, e));
      expect(NEU.diffDays(d, tag)).toBe(ALT.diffDays(d, tag));
      expect(NEU.fortschreiben(v, tag)).toEqual(ALT.fortschreiben(v, tag));
      expect(NEU.kuendigungJetzt(v, tag)).toEqual(ALT.kuendigungJetzt(v, tag));
      expect(NEU.proMonat(v)).toBe(ALT.proMonat(v));
      expect(NEU.aktivAm(v, [], tag)).toBe(ALT.aktivAm(v, [], tag));
    }
  });

  it('Akte als Ganzes: Fristen, Jetzt wichtig, Wartung, Fixkosten, Export (200 Akten)', () => {
    for (let n = 0; n < 200; n++) {
      const vertraege = Array.from({ length: 6 }, (_, i) => vertrag(n * 10 + i));
      const S = {
        vertraege, fassungen: [], dokumente: [], ereignisse: [], schadenfaelle: [], zaehler: [], firmen: [{ id: 'f1', name: 'Beispiel Versicherung AG' }],
        dinge: [{ id: 'd1', name: 'Kombi', kategorie: 'Auto' }],
        belege: [{ id: 'b1', titel: 'Wartung', datum: datum(), arbeitskosten: 300, steuer: 'handwerker', unbar: true, gewArt: wahl(['kauf', 'bauwerk', 'wartung', 'keine']) }],
        fristen: [{ id: 't1', titel: 'Heizungswartung', datum: datum(), status: 'offen' }],
      };
      const tag = datum();
      expect(NEU.alleFristen(S, tag)).toEqual(ALT.alleFristen(S, tag));
      expect(NEU.wichtig(S, tag, 42)).toEqual(ALT.wichtig(S, tag, 42));
      expect(NEU.wartung(S, tag)).toEqual(ALT.wartung(S, tag));
      expect(NEU.fixkosten(S.vertraege, S.fassungen, tag)).toEqual(ALT.fixkosten(S.vertraege, S.fassungen, tag));
      expect(NEU.steuer35a(S.belege, tag.slice(0, 4))).toEqual(ALT.steuer35a(S.belege, tag.slice(0, 4)));
      expect(NEU.jahresBefunde(S, tag)).toEqual(ALT.jahresBefunde(S, tag));
      expect(NEU.exportTabellen(S, tag)).toEqual(ALT.exportTabellen(S, tag));
      expect(NEU.icsText(NEU.alleFristen(S, tag).filter((f: any) => f.datum), 42, '20261115T080000Z'))
        .toBe(ALT.icsText(ALT.alleFristen(S, tag).filter((f: any) => f.datum), 42, '20261115T080000Z'));
      const v = vertraege[0];
      for (const typ of ['erhoehung', 'nachtrag', 'kuendigung', 'bestaetigung']) {
        const e = { beitrag: 99, gueltigAb: datum(), zugang: datum(), zum: datum(), am: datum(), laufzeitende: datum() };
        expect(NEU.ereignisFolgen(typ, v, e, S, tag)).toEqual(ALT.ereignisFolgen(typ, v, e, S, tag));
      }
    }
  });

  it('Schwärzen und Anonymisieren (erfundene Texte)', () => {
    const liste = [{ text: 'Max Mustermann', ersatz: '[Vater]' }, { text: 'Erika Mustermann', ersatz: '[Mutter]' }, { text: 'Musterweg 5', ersatz: '[Adresse]' }, { text: 'max@beispiel.invalid', ersatz: '[E-Mail]' }];
    const teile = ['Herrn Max Mustermann', 'Frau Erika  MUSTERMANN', 'Musterweg 5, 12345 Musterstadt', 'IBAN DE89 3704 0044 0532 0130 00', 'geb. 03.05.1970', 'Vertragsnummer: AB-12345/7',
      'Kundennr. 4711 0815', 'Tel. 0800 111 222', 'Es betreut Sie\nPeter Beispiel', 'Ihr Ansprechpartner: Anna Muster', 'MAX@BEISPIEL.INVALID', 'Beitrag 1.200,00 €', '§ 3 Nr. 2', 'Maximal 5 Jahre'];
    for (let i = 0; i < 300; i++) {
      const t = Array.from({ length: 5 }, () => wahl(teile)).join(wahl(['\n', ' ', ', ']));
      expect(NEU.schwaerzen(t, liste)).toBe(ALT.schwaerzen(t, liste));
      expect(NEU.anonymisieren(t, liste)).toEqual(ALT.anonymisieren(t, liste));
      const su = liste.map((x) => ({ text: x.text, label: x.ersatz }));
      expect(SW.treffer(t, su, { iban: true, ziffern: true })).toEqual(ALT_SU.treffer(t, su, { iban: true, ziffern: true }));
    }
  });

  it('KI-Antwort prüfen (bereinigen) und Schadenergebnis', () => {
    const roh = { dokument: { typ: 'Police', titel: 'Hausrat Max Mustermann', datum: '2026-01-15', gueltigVon: 'gestern' }, vertrag: { kurzname: 'Hausrat', beitrag: '12', fristWert: 3, fristEinheit: 'Monate', online: 'ja' },
      steckbrief: { gefahren: ['Feuer'], versicherungsnummer: '123', mitversichert: ['Max Mustermann'] }, schwaerzen: [{ text: 'Max Mustermann', ersatz: '[Vater]' }], bezug: { vertragId: 'v1', dingId: 'fremd' } };
    const ids = { vertraege: ['v1'], dinge: ['d1'], firmen: [] };
    expect(NEU.bereinigen(roh, ids)).toEqual(ALT.bereinigen(roh, ids));
    const policen = [{ vertragId: 'v1', kurzname: 'Hausrat', steckbrief: { gefahren: ['Feuer'] } }, { vertragId: 'v2', kurzname: 'Haftpflicht', steckbrief: null }];
    const antwort = { policen: [{ vertragId: 'v1', greift: 'nein', begruendung: 'nicht gefunden' }] };
    expect(NEU.schadenErgebnis(policen, antwort)).toEqual(ALT.schadenErgebnis(policen, antwort));
  });
});

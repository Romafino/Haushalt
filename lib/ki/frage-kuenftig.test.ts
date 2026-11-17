/* Frag die Akte: Verträge, die erst später beginnen, und Seitenwahl nach genanntem Vertrag (17.11.2026). Erfundene Daten. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import * as R from '@/lib/regeln';
import { fundSeiten, genannteVertraege, MAX_SEITEN, MAX_SEITEN_VERTRAG, REGELN } from './frage';

const H = '2026-11-17';
const S: any = {
  firmen: [{ id: 'f1', name: 'Beispiel Versicherung AG', hotline: '0800 222' }], dinge: [], belege: [], fristen: [], ereignisse: [], fassungen: [],
  vertraege: [
    { id: 'k1', kurzname: 'Kfz Haftpflicht + Vollkasko', art: 'Versicherung', firmaId: 'f1', status: 'aktiv', beginn: '2027-01-01', abschluss: '2026-11-04', laufzeitende: '2028-01-01', beitrag: 600, zahlweise: 'jaehrlich' },
    { id: 'a1', kurzname: 'Rechtsschutz', art: 'Versicherung', status: 'angebot', beginn: '2027-01-01' },
    { id: 'w1', kurzname: 'Wohngebäude alt', art: 'Versicherung', status: 'beendet', gekuendigtZum: '2025-12-31', abschluss: '2015-01-01' },
    { id: 'h1', kurzname: 'Hausrat', art: 'Versicherung', status: 'aktiv', abschluss: '2020-01-01' }],
  dokumente: [
    { id: 'd1', vertragId: 'k1', typ: 'Police', titel: 'Kfz-Versicherungsschein mit AKB', gueltigVon: '2027-01-01', gueltigBis: '2028-01-01', seiten: 60,
      steckbrief: { gefahren: ['Unfallschäden am eigenen Fahrzeug', 'Vandalismus'], selbstbeteiligung: '300 € Vollkasko', fundstellen: [{ thema: 'Vollkasko', seite: 21, klausel: 'A.2.3' }, { thema: 'SB', seite: 3 }, { thema: 'falsch', seite: 99 }] } },
    { id: 'd2', vertragId: 'w1', typ: 'Police', titel: 'Wohngebäude alt', seiten: 4, steckbrief: { gefahren: ['Leitungswasser'] } }],
};

describe('künftige Verträge', () => {
  it('Frage zu heute: abgeschlossener Vertrag mit späterem Beginn kommt mit Steckbrief unter "kuenftig"', () => {
    const k = R.akteKontext(S, H, H) as any;
    expect(k.inKraft.map((x: any) => x.vertrag)).toEqual(['Hausrat']);
    expect(k.kuenftig.map((x: any) => [x.vertrag, x.beginnt])).toEqual([['Kfz Haftpflicht + Vollkasko', '2027-01-01']]);
    expect(k.kuenftig[0].steckbrief.selbstbeteiligung).toBe('300 € Vollkasko');
    expect(k.kuenftig[0].beitragProMonat).toBe(50);
  });
  it('Angebot und beendeter Vertrag bleiben ohne Steckbrief unter "nichtInKraft"', () => {
    const k = R.akteKontext(S, H, H) as any;
    expect(k.nichtInKraft.map((x: any) => x.vertrag)).toEqual(['Rechtsschutz', 'Wohngebäude alt']);
    expect(JSON.stringify(k).includes('Leitungswasser')).toBe(false);
  });
  it('Frage zu einem vergangenen Datum: keine künftigen Verträge (dort zählt nur, was damals galt)', () => {
    expect((R.akteKontext(S, '2026-06-01', H) as any).kuenftig).toEqual([]);
  });
  it('kuenftigAm: vor Beginn gekündigt zählt nicht', () => {
    expect(R.kuenftigAm({ status: 'gekuendigt', beginn: '2027-01-01', gekuendigtZum: '2026-12-31' }, H)).toBe(false);
    expect(R.kuenftigAm(S.vertraege[0], H)).toBe(true);
    expect(R.kuenftigAm(S.vertraege[0], '2027-01-01')).toBe(false);
  });
  it('Prompt-Regel: Inhalt beantworten, mit „gilt ab“', () => {
    expect(REGELN).toContain('"kuenftig"');
    expect(REGELN).toContain('gilt ab');
  });
});

describe('Seitenwahl nach genanntem Vertrag', () => {
  it('„Vollkasko“ findet den Kfz-Vertrag; allgemeine Wörter wie „Versicherung“ nicht', () => {
    expect(genannteVertraege('was ist alles in der Vollkasko versicherung enthalten', S.vertraege)).toEqual(['k1']);
    expect(genannteVertraege('welche Versicherung habe ich', S.vertraege)).toEqual([]);
    expect(genannteVertraege('Was zahlt die Hausrat bei Einbruch?', S.vertraege)).toEqual(['h1']);
  });
  it('Fundstellen-Seiten aus dem Steckbrief, nur vorhandene Seiten, sortiert, begrenzt', () => {
    expect(fundSeiten(S.dokumente, ['k1'])).toEqual([{ dokumentId: 'd1', seiten: [3, 21] }]);
    expect(fundSeiten(S.dokumente, ['k1'], 1)).toEqual([{ dokumentId: 'd1', seiten: [3] }]);
    expect(fundSeiten(S.dokumente, [])).toEqual([]);
  });
  it('Abschnitt über mehrere Seiten (bisSeite) wird ganz gelesen, höchstens 6 Seiten je Fundstelle, zusammen höchstens 14', () => {
    const d = [{ id: 'x', vertragId: 'k1', seiten: 60, steckbrief: { fundstellen: [{ thema: 'Vollkasko', seite: 20, bisSeite: 23 }, { thema: 'lang', seite: 30, bisSeite: 50 }, { thema: 'verdreht', seite: 10, bisSeite: 2 }] } }];
    expect(fundSeiten(d, ['k1'])).toEqual([{ dokumentId: 'x', seiten: [10, 20, 21, 22, 23, 30, 31, 32, 33, 34, 35] }]);
    const viel = [{ id: 'y', vertragId: 'k1', seiten: 60, steckbrief: { fundstellen: [1, 10, 20].map((s) => ({ seite: s, bisSeite: s + 5 })) } }];
    expect(fundSeiten(viel, ['k1'])[0].seiten).toHaveLength(14);
  });
  it('Seitenlimit: 12, mit genanntem Vertrag 20', () => {
    expect([MAX_SEITEN, MAX_SEITEN_VERTRAG]).toEqual([12, 20]);
  });
});

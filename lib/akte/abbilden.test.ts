/* Tests der Umrechnung Datenbank ↔ Akte. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { akteAus, ausZeile, zuZeile, type Rohdaten } from './abbilden';
import * as R from '@/lib/regeln';

const leer = (): Rohdaten => ({ haushalt: { einstellungen: { vorlaufTage: 42 } }, firmen: [], dinge: [], vertraege: [], vertrag_dinge: [], vertrag_rollen: [], fassungen: [], belege: [], termine: [], ereignisse: [] });

describe('ausZeile / zuZeile', () => {
  it('snake_case → camelCase, null fehlt, Zahlen werden number', () => {
    const v = ausZeile('vertraege', { id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', firma_id: null, beitrag: '120.50', frist_wert: 3, frist_einheit: 'Monate', laufzeitende: '2027-06-30', haushalt_id: 'h' });
    expect(v).toEqual({ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', beitrag: 120.5, fristWert: 3, fristEinheit: 'Monate', laufzeitende: '2027-06-30' });
  });

  it('zuZeile schreibt nur bekannte Felder; leere Texte werden null; keine haushalt_id oder id', () => {
    expect(zuZeile('belege', { titel: 'Wartung', datum: '', arbeitskosten: 200, unbekannt: 'x', id: 'b1', haushaltId: 'fremd' }))
      .toEqual({ titel: 'Wartung', datum: null, arbeitskosten: 200 });
  });

  it('hin und zurück ergibt dasselbe', () => {
    const e = { titel: 'Schornsteinfeger', datum: '2026-12-01', vorlaufTage: 14, wiederholung: 12, status: 'offen', vertragId: 'v1' };
    expect(ausZeile('termine', { id: 't1', ...zuZeile('termine', e) })).toEqual({ id: 't1', ...e });
  });
});

describe('akteAus', () => {
  it('Bezüge: Hauptbezug wird dingId/fuerWen, weitere werden sortiert angehängt', () => {
    const r = leer();
    r.vertraege = [{ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', status: 'aktiv', erstellt_am: '2026-01-02T10:00:00Z' }];
    r.vertrag_dinge = [{ vertrag_id: 'v1', ding_id: 'd2', haupt: false }, { vertrag_id: 'v1', ding_id: 'd1', haupt: true }, { vertrag_id: 'v1', ding_id: 'd0', haupt: false }];
    r.vertrag_rollen = [{ vertrag_id: 'v1', rolle: 'Tochter', haupt: false }, { vertrag_id: 'v1', rolle: 'Familie', haupt: true }];
    const v = akteAus(r).vertraege[0];
    expect([v.dingId, v.weitereDingIds, v.fuerWen, v.weitereRollen, v.angelegt]).toEqual(['d1', ['d0', 'd2'], 'Familie', ['Tochter'], '2026-01-02']);
    expect(R.dingeVon(v)).toEqual(['d1', 'd0', 'd2']);
  });

  it('verworfene Einträge zählen nirgends mit', () => {
    const r = leer();
    r.vertraege = [{ id: 'v1', kurzname: 'A', art: 'Abo', status: 'aktiv', beitrag: 10, zahlweise: 'monatlich' }, { id: 'v2', kurzname: 'B', art: 'Abo', status: 'aktiv', beitrag: 99, zahlweise: 'monatlich', verworfen_am: '2026-11-01T00:00:00Z' }];
    const S = akteAus(r);
    expect(S.vertraege.map((v) => v.id)).toEqual(['v1']);
    expect(R.fixkosten(S.vertraege, S.fassungen, undefined)).toEqual({ monat: 10, jahr: 120 });
  });

  it('Merker zu abgeleiteten Fristen tragen ihren Schlüssel als ID und markieren die Frist als erledigt', () => {
    const r = leer();
    const vid = '11111111-1111-1111-1111-111111111111';
    r.vertraege = [{ id: vid, kurzname: 'Hausrat', art: 'Versicherung', status: 'aktiv', laufzeitende: '2027-06-30', frist_wert: 3, frist_einheit: 'Monate', verlaengerung: '12m' }];
    r.termine = [{ id: 't-db', schluessel: 'kb_' + vid, abgeleitet: true, status: 'offen', erledigt_fuer: '2027-03-31' }];
    const S = akteAus(r);
    expect(S.fristen[0]).toMatchObject({ id: 'kb_' + vid, dbId: 't-db', abgeleitet: true });
    const kb = R.alleFristen(S, '2026-11-15').find((f: { id: string }) => f.id === 'kb_' + vid);
    expect(kb).toMatchObject({ datum: '2027-03-31', erledigt: true });
  });

  it('Einstellungen kommen aus dem Haushalt', () => {
    expect(akteAus(leer()).einst).toEqual({ vorlaufTage: 42 });
  });
});

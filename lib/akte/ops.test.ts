/* opsUebersetzen: Schreib-Schritte des Regelmoduls → Aufträge für ops_anwenden. Erfundene IDs. */
import { describe, expect, it } from 'vitest';
import { opsUebersetzen } from './ops';

const V = '11111111-1111-1111-1111-111111111111';
const T = '22222222-2222-2222-2222-222222222222';
const S = { fristen: [{ id: 'kb_' + V, dbId: T }], ereignisse: [] };

describe('opsUebersetzen', () => {
  it('add → neu, Felder in snake_case, unbekannte Felder (z. B. angelegt) fallen weg', () => {
    expect(opsUebersetzen([{ op: 'add', col: 'fristen', data: { titel: 'X', datum: '2026-12-01', vertragId: V, angelegt: '2026-11-15', quelle: 'leben' } }], S))
      .toEqual([{ art: 'neu', tabelle: 'termine', daten: { titel: 'X', datum: '2026-12-01', vertrag_id: V, quelle: 'leben' } }]);
  });
  it('merge → aendern, entfernen setzt Spalten auf null', () => {
    expect(opsUebersetzen([{ op: 'merge', col: 'vertraege', id: V, data: { erstlaufzeitEnde: '2026-10-31' }, entfernen: ['laufzeitende'] }], S))
      .toEqual([{ art: 'aendern', tabelle: 'vertraege', id: V, daten: { erstlaufzeit_ende: '2026-10-31', laufzeitende: null } }]);
  });
  it('set mit festem Schlüssel → schluessel; ID der Akte wird zur Datenbank-ID', () => {
    expect(opsUebersetzen([{ op: 'set', col: 'ereignisse', id: 'auto_' + V + '_ende', data: { datum: '2026-10-31', typ: 'ende', text: 'x', vertragId: V } }], S)[0])
      .toMatchObject({ art: 'schluessel', tabelle: 'ereignisse', schluessel: 'auto_' + V + '_ende' });
    expect(opsUebersetzen([{ op: 'update', col: 'fristen', id: 'kb_' + V, data: { datum: '2027-01-01' } }], S)[0]).toMatchObject({ art: 'aendern', id: T });
  });
  it('lehnt unbekannte Sammlungen und ungültige IDs ab', () => {
    expect(() => opsUebersetzen([{ op: 'add', col: 'mitglieder', data: {} }], S)).toThrow();
    expect(() => opsUebersetzen([{ op: 'update', col: 'vertraege', id: 'kein-uuid', data: {} }], S)).toThrow();
  });
});

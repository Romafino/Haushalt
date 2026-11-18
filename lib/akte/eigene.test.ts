/* Eigener Wert direkt im Formular: Prüfung. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { eigenerWert, eigenerWertFehler } from './eigene';
import { opsUebersetzen } from './ops';
import * as R from '@/lib/regeln';

const L = [{ text: 'Max Mustermann', ersatz: '[Vater]' }];

describe('eigener Wert', () => {
  it('erlaubt normale Begriffe, säubert Leerzeichen', () => {
    expect(eigenerWertFehler('  Leasing ', L)).toBeNull();
    expect(eigenerWert('  Auto   Leasing ')).toBe('Auto Leasing');
  });
  it('lehnt leere, zu lange Werte, Nummern und Namen aus der Schwärzliste ab', () => {
    expect(eigenerWertFehler('   ', L)).toMatch(/Bitte einen Wert/);
    expect(eigenerWertFehler('x'.repeat(41), L)).toMatch(/40 Zeichen/);
    expect(eigenerWertFehler('Vertrag Nr. 12345678', L)).toMatch(/Rechnungsnummern/);
    expect(eigenerWertFehler('Leasing Max Mustermann', L)).toMatch(/Schwärzliste/);
  });
  it('eigene Ereignisse: eigene Liste ohne eingebaute Werte', () => {
    expect(R.listen({ ereignis: ['Schadenfreiheitsrabatt mitgeteilt'] }).ereignis).toEqual(['Schadenfreiheitsrabatt mitgeteilt']);
    expect(R.mitEigenem({}, 'ereignis', 'Werkstatttermin')?.eigene).toEqual({ ereignis: ['Werkstatttermin'] });
  });
  it('eigenes Ereignis wird als Zeitleisten-Eintrag übersetzt', () => {
    const S = { firmen: [], dinge: [], vertraege: [{ id: 'v1' }], fassungen: [], belege: [], fristen: [], ereignisse: [], dokumente: [], schadenfaelle: [], zaehler: [], einst: {} } as never;
    const ops = opsUebersetzen([{ op: 'add', col: 'ereignisse', data: { datum: '2026-11-18', typ: 'eigen', text: 'Werkstatttermin', vertragId: 'v1' } }] as never, S);
    expect(JSON.stringify(ops)).toContain('"vertrag_id":"v1"');
    expect(JSON.stringify(ops)).toContain('"typ":"eigen"');
  });
});

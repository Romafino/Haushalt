/* Kalender-Abo: Schlüssel, Auswahl der Termine, Datei. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { kalenderIcs, kalenderTermine, neuerSchluessel, schluesselHash, SCHLUESSEL_RE } from './kalender';
import type { Akte } from './abbilden';

const H = '2026-11-15';
const S = {
  firmen: [], dinge: [], belege: [], ereignisse: [], dokumente: [], fassungen: [], schadenfaelle: [], zaehler: [], einst: {},
  vertraege: [{ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', status: 'aktiv', beitrag: 120, zahlweise: 'jaehrlich', laufzeitende: '2027-03-31', fristWert: 3, fristEinheit: 'Monate' }],
  fristen: [
    { id: 't1', titel: 'Heizung warten', datum: '2026-12-01', notiz: 'Max Mustermann anrufen; Tel. privat', manuell: true },
    { id: 't2', titel: 'Alt', datum: '2026-09-01', manuell: true },
  ],
} as unknown as Akte;

describe('Kalender-Abo', () => {
  it('Schlüssel: 43 Zeichen base64url, Hash 64 Hex-Zeichen', async () => {
    const k = neuerSchluessel();
    expect(k).toMatch(SCHLUESSEL_RE);
    expect(neuerSchluessel()).not.toBe(k);
    expect(await schluesselHash('a'.repeat(43))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('nur offene Termine ab 30 Tagen zurück, ohne Notiz', () => {
    const l = kalenderTermine(S, H);
    expect(l.map((f: { id: string }) => f.id)).toContain('t1');
    expect(l.map((f: { id: string }) => f.id)).not.toContain('t2');
    expect(l.every((f: { notiz?: unknown }) => f.notiz === undefined)).toBe(true);
  });

  it('Datei: Name, Aktualisierung, keine Notiz, Kündigungsfrist mit Vorwarnung', () => {
    const ics = kalenderIcs(S, H, new Date('2026-11-15T08:00:00Z'));
    expect(ics).toContain('X-WR-CALNAME:Haushalt\r\n');
    expect(ics).toContain('DTSTAMP:20261115T080000Z');
    expect(ics).toContain('SUMMARY:Heizung warten');
    expect(ics).not.toContain('Mustermann');
    expect(ics).toContain('TRIGGER:-PT999H'); // 42 Tage Vorlauf bei „Kündigen bis“
  });
});

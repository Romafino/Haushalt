/* Datensicherung: verschlüsseln, öffnen, falsches Passwort, fremde Datei. Erfundene Daten; wenige Iterationen für schnelle Tests. */
import { describe, expect, it } from 'vitest';
import { inhaltAus, oeffnen, verschluesselt, zusammenfassung } from './sicherung';

const PW = 'vier zufällige Wörter';
const inhalt = inhaltAus({
  haushalte: [{ id: 'h1', name: 'Zuhause' }],
  vertraege: [{ id: 'v1', kurzname: 'Hausrat' }, { id: 'v2', kurzname: 'Alt', verworfen_am: '2026-01-01' }],
  schwaerzliste: [{ haushalt_id: 'h1', box: { v: 1 } }],
}, { 'dokumente/h1/d1/1.jpg': 'AAAA' }, new Date('2026-11-16T10:00:00Z'));

describe('Datensicherung', () => {
  it('verschlüsselt: im Klartext stehen nur Format, Version, Datum', async () => {
    const d = await verschluesselt(inhalt, PW, 1000);
    const text = JSON.stringify(d);
    expect(text).not.toContain('Hausrat');
    expect(text).not.toContain('Zuhause');
    expect(d.erstellt).toBe('2026-11-16T10:00:00.000Z');
    const zurueck = await oeffnen(text, PW);
    expect(zurueck).toEqual(inhalt);
  });

  it('falsches Passwort, fremde Datei, zu kurzes Passwort', async () => {
    const text = JSON.stringify(await verschluesselt(inhalt, PW, 1000));
    await expect(oeffnen(text, 'falsches Passwort!!')).rejects.toThrow('Passwort passt nicht');
    await expect(oeffnen('{"a":1}', PW)).rejects.toThrow('keine Sicherungsdatei');
    await expect(oeffnen('kein json', PW)).rejects.toThrow('keine Sicherungsdatei');
    await expect(verschluesselt(inhalt, 'kurz')).rejects.toThrow('mindestens 12');
  });

  it('Zusammenfassung zählt ohne Verworfene', () => {
    expect(zusammenfassung(inhalt)).toMatchObject({ vertraege: 1, dateien: 1, schwaerzliste: true, dokumente: 0 });
  });
});

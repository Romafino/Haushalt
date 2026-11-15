/* Schwärzliste: Prüfung und Verschlüsselung. Erfundene Einträge. */
import { describe, expect, it } from 'vitest';
import { aufraeumen, boxAnlegen, boxOeffnen, boxSchreiben, listePruefen, mitSchluessel, passwortPruefen } from './liste';

const L = [{ text: 'Max Mustermann', ersatz: '[Vater]' }, { text: 'Musterweg 5', ersatz: '[Adresse]' }];

describe('listePruefen', () => {
  it('erkennt zu kurz, falscher Platzhalter, doppelt', () => {
    expect(listePruefen([{ text: 'Ma', ersatz: '[X]' }, { text: 'Max Mustermann', ersatz: 'Vater' }, { text: 'Musterweg 5', ersatz: '[Adresse]' }, { text: 'musterweg 5', ersatz: '[Adresse]' }]))
      .toEqual({ 0: 'Mindestens 3 Zeichen.', 1: expect.stringMatching(/eckigen Klammern/), 3: 'Doppelt (siehe Zeile 3).' });
    expect(listePruefen(L)).toEqual({});
  });
  it('aufraeumen entfernt Leerzeilen und Leerzeichen', () => {
    expect(aufraeumen([{ text: ' Max ', ersatz: ' [Vater] ' }, { text: '', ersatz: '' }])).toEqual([{ text: 'Max', ersatz: '[Vater]' }]);
  });
  it('Passwort mindestens 12 Zeichen', () => {
    expect(passwortPruefen('kurz')).not.toBeNull();
    expect(passwortPruefen('vier zufällige Wörter hier')).toBeNull();
  });
});

describe('verschlüsselter Block', () => {
  it('anlegen, öffnen, neu schreiben; Klartext steht nirgends im Block', async () => {
    const { box, key } = await boxAnlegen('vier zufällige Wörter hier', L, 1000);
    expect(JSON.stringify(box)).not.toMatch(/Mustermann|Musterweg/);
    expect(Buffer.from(box.daten, 'base64').toString('latin1')).not.toMatch(/Mustermann/);
    expect(box.salz).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(box.iv).toMatch(/^[A-Za-z0-9+/]{16}$/);
    expect((await boxOeffnen('vier zufällige Wörter hier', box)).liste).toEqual(L);
    const neu = await boxSchreiben(key, box, [...L, { text: 'Erika Mustermann', ersatz: '[Mutter]' }]);
    expect(neu.salz).toBe(box.salz);
    expect(neu.iv).not.toBe(box.iv);
    expect(await mitSchluessel(key, neu)).toHaveLength(3);
  });
  it('falsches Passwort: Fehler mit code passwort', async () => {
    const { box } = await boxAnlegen('vier zufällige Wörter hier', L, 1000);
    await expect(boxOeffnen('falsches Passwort!!', box)).rejects.toEqual({ code: 'passwort' });
  });
});

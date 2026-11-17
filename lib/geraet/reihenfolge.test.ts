/* Mehrere Dateien zu einem Dokument: Reihenfolge nach Dateiname. Erfundene Namen. */
import { describe, expect, it } from 'vitest';
import { dateiReihenfolge } from './seiten';

describe('dateiReihenfolge', () => {
  it('Teile in natürlicher Reihenfolge, unabhängig von der Auswahl', () => {
    const n = (name: string) => ({ name });
    expect(dateiReihenfolge([n('Police Teil 3.pdf'), n('Police Teil 1.pdf'), n('Police Teil 2.pdf')]).map((f) => f.name))
      .toEqual(['Police Teil 1.pdf', 'Police Teil 2.pdf', 'Police Teil 3.pdf']);
    expect(dateiReihenfolge([n('teil10.pdf'), n('Teil2.pdf'), n('teil1.pdf')]).map((f) => f.name)).toEqual(['teil1.pdf', 'Teil2.pdf', 'teil10.pdf']);
    expect(dateiReihenfolge([n('IMG_0100.jpg'), n('IMG_0099.jpg')]).map((f) => f.name)).toEqual(['IMG_0099.jpg', 'IMG_0100.jpg']);
  });
});

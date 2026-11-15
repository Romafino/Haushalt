import { describe, expect, it } from 'vitest';
import { steckbriefAnzeige } from './steckbrief';

describe('Steckbrief-Anzeige', () => {
  it('leere Felder und null fallen weg', () => {
    expect(steckbriefAnzeige({ summen: [], gefahren: [''], selbstbeteiligung: null, fundstellen: [{ thema: '', seite: null, klausel: '' }] })).toEqual([]);
    expect(steckbriefAnzeige(null)).toEqual([]);
  });
  it('deutsche Überschriften, feste Reihenfolge, lesbare Zeilen', () => {
    expect(steckbriefAnzeige({ fundstellen: [{ thema: 'Fahrrad', seite: 2, klausel: '§ 3' }], summen: [{ was: 'Versicherungssumme', betrag: '65.000 €' }], gefahren: ['Feuer', 'Sturm'], selbstbeteiligung: '150 €' })).toEqual([
      { titel: 'Versicherte Gefahren', zeilen: ['Feuer', 'Sturm'] },
      { titel: 'Summen', zeilen: ['Versicherungssumme: 65.000 €'] },
      { titel: 'Selbstbeteiligung', zeilen: ['150 €'] },
      { titel: 'Fundstellen', zeilen: ['Fahrrad · S. 2 · § 3'] },
    ]);
  });
});

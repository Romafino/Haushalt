import { describe, expect, it } from 'vitest';
import { ausschnitt, eintraegeSuchen } from './suche';
import type { Akte } from './abbilden';

const S = {
  firmen: [{ id: 'f1', name: 'Heizung Muster GmbH' }],
  vertraege: [{ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', firmaId: 'f1', status: 'aktiv' }],
  dinge: [{ id: 'd1', name: 'Gastherme', kategorie: 'Haus', hersteller: 'Beispielwerk' }],
  belege: [{ id: 'b1', titel: 'Wartung Heizung', datum: '2026-05-10', firmaId: 'f1' }],
  fristen: [{ id: 't1', titel: 'Heizung warten', datum: '2026-12-01', manuell: true }],
  dokumente: [{ id: 'k1', titel: 'Hausrat 2026', typ: 'Police' }],
  ereignisse: [], fassungen: [], schadenfaelle: [], zaehler: [], einst: {},
} as unknown as Akte;

describe('Direkte Suche', () => {
  it('findet Einträge mit Ziel-Link; alle Wörter müssen vorkommen (auch über Firmennamen)', () => {
    expect(eintraegeSuchen(S, 'hausrat').map((t) => t.href)).toEqual(['/akte/vertraege/v1', '/dokumente/k1']);
    expect(eintraegeSuchen(S, 'heizung muster').map((t) => t.titel)).toContain('Wartung Heizung');
    expect(eintraegeSuchen(S, 'beispielwerk')[0].href).toBe('/akte/dinge/d1');
    expect(eintraegeSuchen(S, 'heizung warten')[0].href).toBe('/akte/termine/t1');
    expect(eintraegeSuchen(S, 'x')).toEqual([]);
  });
  it('Schadenfälle aus eigener Tabelle', () => {
    const t = eintraegeSuchen(S, 'keller', [{ id: 's1', titel: 'Wasserschaden', datum: '2026-11-10', status: 'offen', beschreibung: 'Leitung im Keller geplatzt' }]);
    expect(t.map((x) => x.href)).toEqual(['/schaden/s1']);
  });
  it('Ausschnitt um die Fundstelle, auch bei Wortteil', () => {
    const text = 'Abschnitt A. ' + 'Füllwort '.repeat(20) + '§ 3 Einbruchdiebstahl ist versichert bis zur Versicherungssumme. ' + 'Ende '.repeat(40);
    const a = ausschnitt(text, 'Diebstahl');
    expect(a).toContain('Einbruchdiebstahl ist versichert');
    expect(a.startsWith('… ')).toBe(true);
    expect(a.length).toBeLessThan(200);
  });
});

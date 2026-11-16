/* ZIP- und Excel-Schreiber: mit Python (zipfile, xml) gegengeprüft, falls vorhanden. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, zip } from './zip';
import { blattName, xlsx } from './xlsx';

const python = (() => { try { execFileSync('python3', ['-c', '1']); return true; } catch { return false; } })();
const datei = (b: Uint8Array) => { const p = join(mkdtempSync(join(tmpdir(), 'export-')), 'x.zip'); writeFileSync(p, b); return p; };

describe('Export-Formate', () => {
  it('CRC-32 nach Norm', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it.runIf(python)('ZIP: Namen mit Umlauten, Inhalt und Prüfsumme lesbar', () => {
    const p = datei(zip([{ name: 'Verträge/übersicht.txt', daten: 'Hausrat – 120 €' }, { name: 'bild.jpg', daten: new Uint8Array([1, 2, 3]) }]));
    const out = execFileSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(z.namelist());print(z.read("Verträge/übersicht.txt").decode())', p]).toString();
    expect(out).toContain("['Verträge/übersicht.txt', 'bild.jpg']");
    expect(out).toContain('Hausrat – 120 €');
  });

  it.runIf(python)('Excel: Blätter, Kopfzeile, Zahl als Zahl, Sonderzeichen maskiert, XML gültig', () => {
    const p = datei(xlsx([{ name: 'Verträge', zeilen: [{ Kurzname: 'Hausrat <Test> & Co', Beitrag: 120.5 }, { Kurzname: 'Strom', Status: 'aktiv' }] }, { name: '§35a', zeilen: [] }]));
    const out = execFileSync('python3', ['-c', `
import sys,zipfile,xml.dom.minidom as m
z=zipfile.ZipFile(sys.argv[1])
for n in z.namelist():
  if n.endswith('.xml') or n.endswith('.rels'): m.parseString(z.read(n))
print(z.read('xl/workbook.xml').decode()); print(z.read('xl/worksheets/sheet1.xml').decode())`, p]).toString();
    expect(out).toContain('name="Verträge"');
    expect(out).toContain('name="§35a"');
    expect(out).toContain('<v>120.5</v>');
    expect(out).toContain('Hausrat &lt;Test&gt; &amp; Co');
    expect(out).toContain('>Status<');
  });

  it('Blattnamen: verbotene Zeichen, Länge, doppelt', () => {
    const v = new Set<string>();
    expect(blattName('A/B: [C]', v)).toBe('A B   C ');
    expect(blattName('x'.repeat(40), v)).toHaveLength(31);
    expect(blattName('A/B: [C]', v)).toBe('A B   C  2');
  });
});

import { dateiname, exportBlaetter } from './blaetter';
import type { Akte } from '@/lib/akte/abbilden';

describe('Lesbarer Export', () => {
  const S = {
    firmen: [{ id: 'f1', name: 'Beispiel Versicherung AG' }], dinge: [], belege: [], fristen: [], ereignisse: [], fassungen: [], schadenfaelle: [], zaehler: [], einst: {},
    vertraege: [{ id: 'v1', kurzname: 'Hausrat', art: 'Versicherung', firmaId: 'f1', status: 'aktiv', beitrag: 120, zahlweise: 'jaehrlich' }],
    dokumente: [{ id: 'd1', titel: 'Police 2026', typ: 'Police', vertragId: 'v1', seiten: 2 }],
  } as unknown as Akte;
  it('Blätter mit Inhalt; Schadenfälle und Prüfungen aus eigenen Tabellen; Leere fallen weg', () => {
    const b = exportBlaetter(S, { schadenfaelle: [{ id: 's1', datum: '2026-11-10', titel: 'Wasserschaden', status: 'offen', beschreibung: 'Leitung' }], pruefungen: [{ schaden_id: 's1', vertrag_id: 'v1', greift: 'ja', fundstellen: [{ seite: 2, klausel: '§ 3' }] }], fragen: [] }, '2026-11-16');
    const namen = b.map((x) => x.name);
    expect(namen).toEqual(expect.arrayContaining(['Verträge', 'Firmen', 'Dokumente', 'Schadenfälle', 'Schadenprüfungen']));
    expect(namen).not.toContain('Gespeicherte Fragen');
    expect(b.find((x) => x.name === 'Schadenprüfungen')!.zeilen[0]).toMatchObject({ Schadenfall: 'Wasserschaden', Vertrag: 'Hausrat', Ergebnis: 'greift wahrscheinlich', Fundstellen: '2 § 3' });
    expect(b.find((x) => x.name === 'Dokumente')!.zeilen[0]).toMatchObject({ Titel: 'Police 2026', Vertrag: 'Hausrat' });
  });
  it('Dateinamen ohne Sonderzeichen', () => {
    expect(dateiname('Police: Hausrat/2026?', 'abcdef12-3456')).toBe('Police Hausrat 2026 abcdef12');
    expect(dateiname('', 'abcdef12')).toBe('ohne Titel abcdef12');
  });
});

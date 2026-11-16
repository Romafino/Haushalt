/* PDF-Schreiber: mit pdf.js gelesen (Text, Umlaute, €, Seitenzahl). Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { pdf } from './pdf';

async function lesen(daten: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: daten.slice(), useSystemFonts: false, disableFontFace: true }).promise;
  const texte: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) texte.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => ('str' in x ? x.str : '')).join('\n'));
  return { seiten: doc.numPages, texte };
}

describe('PDF', () => {
  it('Text mit Umlauten, ß, € und Anführungszeichen; Klammern maskiert', async () => {
    const r = await lesen(pdf([{ art: 'titel', text: 'Notfallblatt' }, { art: 'h', text: 'Versicherungen' }, { art: 'text', text: 'Hausrat – Beispiel Versicherung AG (Hotline 0800 111 2222)' }, { art: 'klein', text: 'Größe „groß“: 120,00 € · Straße' }], 'Stand 16.11.2026'));
    const t = r.texte.join('\n');
    expect(r.seiten).toBe(1);
    expect(t).toContain('Notfallblatt');
    expect(t).toContain('Hausrat – Beispiel Versicherung AG (Hotline 0800 111 2222)');
    expect(t).toContain('Größe „groß“: 120,00 € · Straße');
    expect(t).toContain('Stand 16.11.2026 · Seite 1 von 1');
  });

  it('langer Inhalt: Umbruch und mehrere Seiten', async () => {
    const lang = Array.from({ length: 120 }, (_, i) => ({ art: 'text' as const, text: `Zeile ${i + 1}: ` + 'Wort '.repeat(30) }));
    const r = await lesen(pdf(lang));
    expect(r.seiten).toBeGreaterThan(3);
    expect(r.texte.at(-1)).toContain(`Seite ${r.seiten} von ${r.seiten}`);
  });
});

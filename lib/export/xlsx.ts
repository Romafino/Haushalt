/* Minimale Excel-Datei (.xlsx, Office Open XML): je Blatt eine Tabelle mit Kopfzeile. Zahlen als Zahl, alles andere als Text.
   Öffnet in Excel, Numbers, LibreOffice und Google Tabellen. Reines Modul. */
import { zip } from './zip';

export type Blatt = { name: string; zeilen: Record<string, unknown>[] };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // in XML nicht erlaubte Steuerzeichen entfernen
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const spalte = (i: number) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
/* Excel-Blattnamen: max. 31 Zeichen, ohne : \ / ? * [ ] */
export const blattName = (n: string, vergeben: Set<string>) => {
  let b = n.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Blatt';
  for (let i = 2; vergeben.has(b); i++) b = b.slice(0, 28) + ' ' + i;
  vergeben.add(b); return b;
};

function zelle(ref: string, w: unknown) {
  if (w == null || w === '') return '';
  if (typeof w === 'number' && Number.isFinite(w)) return `<c r="${ref}"><v>${w}</v></c>`;
  const t = typeof w === 'boolean' ? (w ? 'ja' : '') : typeof w === 'object' ? JSON.stringify(w) : String(w);
  return t ? `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(t.slice(0, 32000))}</t></is></c>` : '';
}

function blattXml(b: Blatt) {
  const kopf = Array.from(new Set(b.zeilen.flatMap((z) => Object.keys(z))));
  const zeilen = [kopf, ...b.zeilen.map((z) => kopf.map((k) => z[k]))]
    .map((r, i) => `<row r="${i + 1}">${r.map((w, j) => zelle(spalte(j) + (i + 1), w)).join('')}</row>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + zeilen + '</sheetData></worksheet>';
}

export function xlsx(blaetter: Blatt[], jetzt = new Date()): Uint8Array {
  const vergeben = new Set<string>(), namen = blaetter.map((b) => blattName(b.name, vergeben));
  return zip([
    { name: '[Content_Types].xml', daten: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + blaetter.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
    { name: '_rels/.rels', daten: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', daten: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + namen.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', daten: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + blaetter.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>' },
    ...blaetter.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, daten: blattXml(b) })),
  ], jetzt);
}

/* Minimaler PDF-Schreiber für Text (A4, Helvetica, WinAnsi-Kodierung für Umlaute, ß und €), mit Zeilenumbruch und Seitenumbruch.
   Ohne Bibliothek; reicht für Notfallblatt und Steuerliste. Reines Modul. */

export type Block = { art: 'titel' | 'h' | 'text' | 'klein' | 'abstand'; text?: string };

// Zeichenbreiten von Helvetica (Standard-AFM, 1/1000 em) für ASCII 32–126
const BREITE = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
  667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556,
  333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
// Sonderzeichen in WinAnsi (cp1252), die nicht Latin-1 sind
const WIN: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };

function kodiere(t: string): number[] {
  return Array.from(t.normalize('NFC')).map((c) => {
    const k = c.charCodeAt(0);
    if (k >= 32 && k <= 126) return k;
    if (WIN[c]) return WIN[c];
    if (k >= 160 && k <= 255) return k;
    return 63; // „?“ für nicht darstellbare Zeichen
  });
}
const breite = (t: string, groesse: number, fett: boolean) =>
  kodiere(t).reduce((s, k) => s + (k >= 32 && k <= 126 ? BREITE[k - 32] : k === 0xdf ? 611 : 556), 0) * groesse / 1000 * (fett ? 1.08 : 1);

/** PDF-String: ASCII bleibt, alles andere als Oktal-Escape (die Datei bleibt reines ASCII). */
const pdfString = (t: string) => '(' + kodiere(t).map((k) => (k === 40 || k === 41 || k === 92 ? '\\' + String.fromCharCode(k) : k > 126 ? '\\' + k.toString(8).padStart(3, '0') : String.fromCharCode(k))).join('') + ')';

function umbrechen(t: string, max: number, groesse: number, fett: boolean): string[] {
  const zeilen: string[] = [];
  for (const absatz of t.split('\n')) {
    let z = '';
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const neu = z ? z + ' ' + wort : wort;
      if (breite(neu, groesse, fett) <= max) { z = neu; continue; }
      if (z) zeilen.push(z);
      let w = wort; // überlanges Wort hart trennen
      while (breite(w, groesse, fett) > max) { let i = w.length; while (i > 1 && breite(w.slice(0, i), groesse, fett) > max) i--; zeilen.push(w.slice(0, i)); w = w.slice(i); }
      z = w;
    }
    zeilen.push(z);
  }
  return zeilen;
}

const STIL = { titel: { g: 18, f: true, vor: 0, nach: 8 }, h: { g: 12.5, f: true, vor: 10, nach: 3 }, text: { g: 10.5, f: false, vor: 0, nach: 2 }, klein: { g: 9, f: false, vor: 0, nach: 3 } } as const;

export function pdf(bloecke: Block[], fuss = ''): Uint8Array {
  const B = 595.28, H = 841.89, R = 50, OBEN = H - 56, UNTEN = 56, MAX = B - 2 * R;
  const seiten: string[][] = [[]];
  let y = OBEN;
  const zeile = (text: string, g: number, fett: boolean, grau: boolean) => {
    if (y - g < UNTEN) { seiten.push([]); y = OBEN; }
    y -= g * 1.25;
    seiten[seiten.length - 1].push(`BT /${fett ? 'F2' : 'F1'} ${g} Tf ${grau ? '0.35 g' : '0 g'} ${R} ${y.toFixed(2)} Td ${pdfString(text)} Tj ET`);
  };
  for (const b of bloecke) {
    if (b.art === 'abstand') { y -= 8; continue; }
    const s = STIL[b.art];
    if (s.vor && y < OBEN) y -= s.vor;
    if (b.art === 'h' && y - 4 * s.g < UNTEN) { seiten.push([]); y = OBEN; } // Überschrift nicht allein am Seitenende
    for (const z of umbrechen(b.text ?? '', MAX, s.g, s.f)) zeile(z, s.g, s.f, b.art === 'klein');
    y -= s.nach;
  }

  const objekte: string[] = [];
  const neu = (inhalt: string) => { objekte.push(inhalt); return objekte.length; };
  const katalog = neu(''), seitenObj = neu('');
  const f1 = neu('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = neu('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kinder: number[] = [];
  seiten.forEach((inhalt, i) => {
    const fussText = `BT /F1 8 Tf 0.35 g ${R} 30 Td ${pdfString(`${fuss ? fuss + ' · ' : ''}Seite ${i + 1} von ${seiten.length}`)} Tj ET`;
    const strom = [...inhalt, fussText].join('\n');
    const s = neu(`<< /Length ${strom.length} >>\nstream\n${strom}\nendstream`);
    kinder.push(neu(`<< /Type /Page /Parent ${seitenObj} 0 R /MediaBox [0 0 ${B} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${s} 0 R >>`));
  });
  objekte[katalog - 1] = `<< /Type /Catalog /Pages ${seitenObj} 0 R >>`;
  objekte[seitenObj - 1] = `<< /Type /Pages /Kids [${kinder.map((k) => k + ' 0 R').join(' ')}] /Count ${kinder.length} >>`;

  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objekte.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objekte.length + 1} /Root ${katalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out); // reines ASCII
}

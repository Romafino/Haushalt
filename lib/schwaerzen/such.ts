/* Übernommen aus altbestand/schwaerzer/such.js (Schwärzer: Fundstellen in einer Textzeile, Balken, Liste lesen).
   Verhalten unverändert; Typen zunächst grob (any). */
/* eslint-disable @typescript-eslint/no-explicit-any */

const reEsc = (t: any) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GRENZE_V = '(?<![A-Za-zÄÖÜäöüß0-9])', GRENZE_N = '(?![A-Za-zÄÖÜäöüß0-9])';
/* Je Wort: wie eingetragen, GROSS oder mit großem Anfangsbuchstaben. E-Mail-Adressen ohne Rücksicht auf Groß/Klein. */
function muster(text: any) {
  const wort = (w: any) => '(?:' + Array.from(new Set([w, w.toUpperCase(), w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()])).map(reEsc).join('|') + ')';
  const kern = text.trim().split(/\s+/).map(wort).join('[\\s,]+'), fl = text.includes('@') ? 'gi' : 'g';
  try { return new RegExp(GRENZE_V + kern + GRENZE_N, fl); } catch { return new RegExp(kern, fl); }
}
const IBAN = /\b[A-Z]{2}\d{2}(?:[  ]?[0-9A-Z]{4}){3,7}(?:[  ]?[0-9A-Z]{1,3})?\b/g;
const ZIFFERN = /(?<![\d,.]|\d[,.])\d(?:[  ./-]?\d){4,}(?!\d|,\d)/g;   /* 5 und mehr Ziffern, auch mit Leerzeichen, Punkt oder Strich; keine Beträge mit Komma */
/* Gibt [{start, ende, label, quelle}] zurück, ohne Überlappungen (längere und frühere Treffer gewinnen). */
function treffer(zeile: any, eintraege: any, opt: any) {
  opt = opt || {}; const out: any[] = [];
  for (const e of eintraege || []) {
    if (!e || typeof e.text !== 'string' || e.text.trim().length < 2) continue;
    const re = muster(e.text); let m;
    while ((m = re.exec(zeile))) { if (!m[0].length) { re.lastIndex++; continue; } out.push({ start: m.index, ende: m.index + m[0].length, label: e.label || '', quelle: 'liste' }); }
  }
  if (opt.iban) { IBAN.lastIndex = 0; let m; while ((m = IBAN.exec(zeile))) out.push({ start: m.index, ende: m.index + m[0].length, label: opt.ibanLabel || '[IBAN]', quelle: 'iban' }); }
  if (opt.ziffern) { ZIFFERN.lastIndex = 0; let m; while ((m = ZIFFERN.exec(zeile))) out.push({ start: m.index, ende: m.index + m[0].length, label: opt.zifferLabel || '[Nummer]', quelle: 'ziffern' }); }
  out.sort((a, b) => (b.ende - b.start) - (a.ende - a.start) || a.start - b.start);
  const frei: any[] = [];
  for (const t of out) if (!frei.some(f => t.start < f.ende && f.start < t.ende)) frei.push(t);
  return frei.sort((a, b) => a.start - b.start);
}
/* Liste lesen: Export-Datei dieses Werkzeugs, der Haushalts-App, oder Text mit einer Zeile je Eintrag „Text;Beschriftung“. */
function liesListe(inhalt: any) {
  const t = String(inhalt || '').replace(/^﻿/, '').trim(), ok = (text: any, label: any) => ({ text: String(text).trim(), label: String(label || '').trim().slice(0, 30) });
  if (t.startsWith('{') || t.startsWith('[')) {
    let b; try { b = JSON.parse(t); } catch { return null; }
    const l = Array.isArray(b) ? b : b && Array.isArray(b.liste) ? b.liste : null;
    if (!l) return null;
    const out = l.filter((x: any) => x && typeof x.text === 'string' && x.text.trim().length >= 2).map((x: any) => ok(x.text, x.label != null ? x.label : x.ersatz));
    return out.length ? out : null;
  }
  const out = [];
  for (const z of t.split(/\r\n|\n|\r/)) {
    const zeile = z.trim(); if (!zeile || zeile.startsWith('#')) continue;
    const i = zeile.search(/[;\t]/), text = (i < 0 ? zeile : zeile.slice(0, i)).trim().replace(/^"|"$/g, ''), label = i < 0 ? '' : zeile.slice(i + 1).trim().replace(/^"|"$/g, '');
    if (/^text$/i.test(text) || text.includes('�') || text.length < 2) continue;
    out.push(ok(text, label));
  }
  return out.length ? out : null;
}
/* Zeichen-Rechtecke einer Zeile aus Stücken (PDF-Textstücke oder erkannte Wörter) bauen.
   stuecke: [{str, x0, y0, x1, y1}] in Bildpunkten, nach x sortiert. Gibt {text, kasten(i)} zurück. */
function zeileAus(stuecke: any) {
  let text = ''; const pos: any[] = [];
  stuecke.forEach((s: any, k: any) => {
    if (k && !/\s$/.test(text) && !/^\s/.test(s.str)) { const v = stuecke[k - 1], luecke = s.x0 - v.x1, h = Math.max(1, v.y1 - v.y0); if (luecke > h * 0.15) { text += ' '; pos.push({ x0: v.x1, x1: s.x0, y0: Math.min(v.y0, s.y0), y1: Math.max(v.y1, s.y1) }); } }
    const n = Math.max(1, s.str.length), b = (s.x1 - s.x0) / n;
    for (let i = 0; i < s.str.length; i++) { text += s.str[i]; pos.push({ x0: s.x0 + b * i, x1: s.x0 + b * (i + 1), y0: s.y0, y1: s.y1 }); }
  });
  return { text, kasten: (a: any, e: any) => { const p = pos.slice(a, e); return { x: Math.min(...p.map(q => q.x0)), y: Math.min(...p.map(q => q.y0)), w: Math.max(...p.map(q => q.x1)) - Math.min(...p.map(q => q.x0)), h: Math.max(...p.map(q => q.y1)) - Math.min(...p.map(q => q.y0)) }; } };
}
/* Stücke einer Seite in Zeilen gruppieren (gleiche Höhe, sich überlappende y-Bereiche). */
function zeilen(stuecke: any) {
  const s = stuecke.filter((x: any) => x.str && x.str.trim()).slice().sort((a: any, b: any) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2), out: any[] = [];
  for (const x of s) {
    const m = (x.y0 + x.y1) / 2, z = out.find(l => Math.abs(l.m - m) < Math.max(3, (x.y1 - x.y0) * 0.5));
    if (z) { z.s.push(x); } else out.push({ m, s: [x] });
  }
  return out.map(l => l.s.sort((a: any, b: any) => a.x0 - b.x0));
}
/* Alle Balken einer Seite: Rechtecke mit etwas Rand. */
function balkenFuer(stuecke: any, eintraege: any, opt: any) {
  const out = [];
  for (const z of zeilen(stuecke)) {
    const zl = zeileAus(z);
    for (const t of treffer(zl.text, eintraege, opt)) {
      const k = zl.kasten(t.start, t.ende), r = Math.max(2, k.h * 0.18), rx = Math.max(3, k.h * 0.45); /* seitlich mehr Rand: Zeichenbreiten sind nur geschätzt */
      out.push({ x: k.x - rx, y: k.y - r, w: k.w + 2 * rx, h: k.h + 2 * r, label: t.label, auto: true, quelle: t.quelle });
    }
  }
  return out;
}

export { treffer, liesListe, zeileAus, zeilen, balkenFuer };

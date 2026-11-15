/* Geschwärzter Text einer Seite aus erkannten Wörtern (PDF-Textstücke oder Texterkennung) und den Balken.
   Jedes Wort, das zu großen Teilen unter einem Balken liegt, wird durch dessen Platzhalter ersetzt – auch bei Balken,
   die von Hand gezogen wurden. Danach zur Sicherheit noch einmal Liste + Muster (anonymisieren). Reines Modul. */
import { anonymisieren, balkenFuer, treffer, zeileAus, zeilen } from './index';
import { ANREDE_RE, GEB_RE, NR_BLEIBT, NR_NACKT, NR_RE } from './text';
import type { ListenEintrag } from './liste';

export type Stueck = { str: string; x0: number; x1: number; y0: number; y1: number };
export type Balken = { x: number; y: number; w: number; h: number; label?: string; auto?: boolean; quelle?: string };

const ueberdeckt = (s: Stueck, b: Balken) => {
  const w = Math.max(0, Math.min(s.x1, b.x + b.w) - Math.max(s.x0, b.x));
  const h = Math.max(0, Math.min(s.y1, b.y + b.h) - Math.max(s.y0, b.y));
  const flaeche = Math.max(1, (s.x1 - s.x0) * (s.y1 - s.y0));
  return (w * h) / flaeche;
};

const ueberlappung = (a: Balken, b: Balken) => {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (w * h) / Math.max(1, a.w * a.h);
};

/* Nummern ab 5 Ziffern (wie im Schwärzer), aber Datumsangaben bleiben stehen (die KI braucht Laufzeiten und Fristen),
   ebenso Telefonnummern direkt hinter „Tel.“, „Hotline“, „Fax“ (Firmen; eigene Nummern stehen in der Schwärzliste). */
const DATUM = /^(\d{1,2}\.\s?\d{1,2}\.\s?(\d{2}|\d{4})|\d{4}-\d{2}-\d{2})$/;
const TELEFON_DAVOR = /(tel|telefon|fax|hotline|service|ruf|mobil)[\s.:/-]*(\+?\d[\d\s/-]*)?$/i;
export function nummernTreffer(text: string): { start: number; ende: number }[] {
  return (treffer(text, [], { ziffern: true }) as { start: number; ende: number }[]).filter((t) => {
    const wert = text.slice(t.start, t.ende).trim();
    const davor = text.slice(Math.max(0, t.start - 24), t.start).split('\n').pop() ?? '';
    return !DATUM.test(wert) && !TELEFON_DAVOR.test(davor);
  });
}

/** Stellen, die auch im Bild geschwärzt werden müssen, weil die Text-Absicherung (anonymisieren) sie ersetzt:
    Geburtsdatum, Nummern hinter Bezeichnungen wie „Vertrags-Nr.“, Namen nach „Herr/Frau“, dazu Nummern (Regel oben). */
export function musterBereiche(text: string): { start: number; ende: number; label: string }[] {
  const out: { start: number; ende: number; label: string }[] = [];
  const alle = (re: RegExp, f: (m: RegExpExecArray) => void) => { const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m; while ((m = r.exec(text))) { if (!m[0].length) { r.lastIndex++; continue; } f(m); } };
  alle(GEB_RE, (m) => out.push({ start: m.index + m[1].length, ende: m.index + m[0].length, label: '[Geburtsdatum]' }));
  alle(NR_RE, (m) => {
    const a = m[1], w = m[2], ende = (/[.\-\/]+$/.exec(w) || [''])[0], wert = w.slice(0, w.length - ende.length);
    if (NR_BLEIBT.test(a) || (NR_NACKT.test(a) && wert.replace(/[^A-Z0-9]/g, '').length < 5)) return; // wie anonymisieren
    out.push({ start: m.index + a.length, ende: m.index + a.length + wert.length, label: '[Nummer]' });
  });
  alle(ANREDE_RE, (m) => { const s = m.index + m[0].length - m[2].length; out.push({ start: s, ende: s + m[2].length, label: '[Name]' }); });
  for (const t of nummernTreffer(text)) out.push({ ...t, label: '[Nummer]' });
  return out;
}

/** Automatische Balken einer Seite: Liste und IBAN (übernommen, balkenFuer) plus musterBereiche je Zeile. */
export function autoBalken(stuecke: Stueck[], liste: ListenEintrag[]): Balken[] {
  const out: Balken[] = balkenFuer(stuecke, liste.map((e) => ({ text: e.text, label: e.ersatz })), { iban: true });
  for (const z of zeilen(stuecke) as Stueck[][]) {
    const zl = zeileAus(z);
    for (const t of musterBereiche(zl.text)) {
      const k = zl.kasten(t.start, t.ende), r = Math.max(2, k.h * 0.18), rx = Math.max(3, k.h * 0.45);
      const neu: Balken = { x: k.x - rx, y: k.y - r, w: k.w + 2 * rx, h: k.h + 2 * r, label: t.label, auto: true, quelle: t.label === '[Nummer]' ? 'ziffern' : 'muster' };
      // Liste und IBAN haben Vorrang: liegt dort schon ein Balken, entfällt der Musterbalken (sonst überlagerte Platzhalter)
      if (out.some((b) => ueberlappung(neu, b) > 0.3)) continue;
      out.push(neu);
    }
  }
  return out;
}

export function seitenText(stuecke: Stueck[] | null, balken: Balken[], liste: ListenEintrag[]): string {
  if (!stuecke?.length) return '';
  const out: string[] = [];
  for (const z of zeilen(stuecke) as Stueck[][]) {
    const teile: string[] = [];
    for (const s of z) {
      const b = balken.find((x) => ueberdeckt(s, x) >= 0.4);
      const wort = b ? (b.label && /^\[[^\]]{1,20}\]$/.test(b.label) ? b.label : '[geschwärzt]') : s.str;
      if (b && teile[teile.length - 1] === wort) continue; // ein Balken über mehrere Wörter → ein Platzhalter
      teile.push(wort);
    }
    out.push(teile.join(' ').replace(/\s+/g, ' ').trim());
  }
  let text: string = anonymisieren(out.join('\n'), liste).text;
  for (const t of nummernTreffer(text).reverse()) text = text.slice(0, t.start) + '[Nummer]' + text.slice(t.ende);
  return text;
}

/** Zweite Prüfung: Welche Einträge der Schwärzliste stehen (noch) im Text? Leere Liste = sauber. */
export function listenTreffer(text: string, liste: ListenEintrag[]): string[] {
  const t = treffer(text, liste.map((e) => ({ text: e.text, label: e.ersatz })), {});
  return Array.from(new Set(t.map((x: { start: number; ende: number }) => text.slice(x.start, x.ende))));
}

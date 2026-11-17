/* Geschwärzter Text einer Seite aus erkannten Wörtern (PDF-Textstücke oder Texterkennung) und den Balken.
   Jedes Wort, das zu großen Teilen unter einem Balken liegt, wird durch dessen Platzhalter ersetzt – auch bei Balken,
   die von Hand gezogen wurden. Danach zur Sicherheit noch einmal Liste + Muster (anonymisieren). Reines Modul. */
import { anonymisieren, balkenFuer, treffer, zeileAus, zeilen } from './index';
import { ANREDE_RE, GEB_RE, NR_BLEIBT, NR_NACKT, NR_RE } from './text';
import { istMobil, kundenfelder, TECHNIK_DAVOR, telefonTreffer } from './genauer';
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
/* Beträge im deutschen Tausenderformat (65.000 / 1.200.000) bleiben stehen: Versicherungssummen braucht der Steckbrief.
   Nummern mit Bezeichnung („Vers.-Nr. 12.345.678“) fängt musterBereiche über die Bezeichnung. */
const BETRAG = /^\d{1,3}(\.\d{3})+$/;
/* Monat/Jahr und Zeiträume bleiben stehen (Tarifstand „10/2026“, „01.2026“, „2026/2027“, „2026-10“). Bewusst ergänzt 16.11.2026. */
const MONAT_JAHR = /^((0?[1-9]|1[0-2])[./]\s?(19|20)\d{2}|(19|20)\d{2}[/-]((0?[1-9]|1[0-2])|(19|20)\d{2}))$/;
/* Zahl mit Einheit dahinter ist ein Wert, keine Nummer: Betrag (€, EUR, Euro), Zählerstand/Leistung (kWh, km, m³, qm, PS, kW, l). */
const EINHEIT_DANACH = /^\s?(€|eur\b|euro\b|kwh\b|km\b|m³|m3\b|m²|qm\b|ps\b|kw\b|l\b|liter\b)/i;
const TELEFON_DAVOR = /(tel|telefon|fax|hotline|service|ruf|mobil)[\s.:/-]*(\+?\d[\d\s/-]*)?$/i;
/* Alte Daten (Wunsch 16.11.2026): vollständige Datumsangaben, die mehr als 15 Jahre zurückliegen, könnten Geburtstage sein
   und werden zu [Datum]. Erkannt: 12.03.1965, 12.3.65, 1965-03-12, 12. März 1965. Bloße Jahreszahlen (Baujahr 1998) bleiben. */
const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const ALT_RE = new RegExp('\\b(\\d{1,2})\\.\\s?(\\d{1,2})\\.\\s?(\\d{4}|\\d{2})(?!\\d)|\\b(\\d{4})-(\\d{2})-(\\d{2})\\b|\\b(\\d{1,2})\\.\\s?(' + MONATE.join('|') + ')\\s(\\d{4})\\b', 'gi');
const isoHeute = () => new Date().toISOString().slice(0, 10);
export function alteDaten(text: string, heute: string = isoHeute()): { start: number; ende: number }[] {
  const jetzt = Number(heute.slice(0, 4)), grenze = String(jetzt - 15) + heute.slice(4);
  const out: { start: number; ende: number }[] = [];
  for (const m of text.matchAll(ALT_RE)) {
    let j: number, mo: number, t: number;
    if (m[1]) { t = +m[1]; mo = +m[2]; j = +m[3]; if (m[3].length === 2) j += j + 2000 > jetzt ? 1900 : 2000; }
    else if (m[4]) { j = +m[4]; mo = +m[5]; t = +m[6]; }
    else { t = +m[7]; mo = MONATE.indexOf(m[8].toLowerCase()) + 1; j = +m[9]; }
    const iso = `${j}-${String(mo).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) continue; // kein gültiges Datum (z. B. 31.02.)
    if (iso < grenze) out.push({ start: m.index!, ende: m.index! + m[0].length });
  }
  return out;
}

export function nummernTreffer(text: string): { start: number; ende: number }[] {
  return (treffer(text, [], { ziffern: true }) as { start: number; ende: number }[]).filter((t) => {
    const wert = text.slice(t.start, t.ende).trim();
    const davor = text.slice(Math.max(0, t.start - 24), t.start).split('\n').pop() ?? '';
    const danach = text.slice(t.ende, t.ende + 8);
    if (istMobil(wert, davor)) return true; // Handynummern immer
    if (TECHNIK_DAVOR.test(davor)) return false; // Zähler, Mess-/Marktlokation
    return !DATUM.test(wert) && !BETRAG.test(wert) && !MONAT_JAHR.test(wert) && !EINHEIT_DANACH.test(danach) && !TELEFON_DAVOR.test(davor);
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
  for (const t of alteDaten(text)) if (!out.some((o) => o.start < t.ende && t.start < o.ende)) out.push({ ...t, label: '[Datum]' });
  return out;
}

/* Anschriftenfeld: Zeile nur „Herrn/Frau/Familie/Eheleute“ → nächste Zeile Name, danach Straße/Ort als Adresse.
   Zusätzlich: Straße + darunter „PLZ Ort“ → beide Adresse (auch wenn die Anrede fehlt oder schon geschwärzt ist). */
const ANREDE_ZEILE = /^(herrn?|frau|familie|eheleute)$/i;
const STRASSE = /^[A-ZÄÖÜ][^\d]{2,}\s\d{1,4}\s?[a-zA-Z]?(\s*[-/]\s*\d{1,4}[a-zA-Z]?)?$/;
const PLZ_ORT = /^\d{5}\s+[A-ZÄÖÜ]/;
const FIRMA = /\b(AG|GmbH|mbH|KG|KGaA|SE|e\.\s?V\.|VVaG|Versicherung\w*|Versicherungsservice|Sparkasse|Bank|Stadtwerke|Kundenservice|Service|Postfach)\b/i;
const KONTAKT = /\b(tel|telefon|fax|e-?mail|hotline)\b|www\.|@/i;
export function anschriftZeilen(zeilenTexte: string[]): { index: number; label: string }[] {
  const out: { index: number; label: string }[] = [];
  zeilenTexte.forEach((t, i) => {
    if (!ANREDE_ZEILE.test(t.trim()) || i + 1 >= zeilenTexte.length) return;
    out.push({ index: i + 1, label: '[Name]' });
    for (let j = i + 2; j <= i + 4 && j < zeilenTexte.length; j++) {
      const z = zeilenTexte[j].trim();
      if (STRASSE.test(z) || PLZ_ORT.test(z)) out.push({ index: j, label: '[Adresse]' }); else break;
    }
  });
  // auch ohne Anrede: Straße direkt über „PLZ Ort“ ist eine Anschrift – außer bei erkennbaren Firmenanschriften:
  // Firmenname direkt darüber oder Telefon/Fax/E-Mail in den zwei Zeilen darunter. Steht direkt darüber ein geschwärzter
  // Name (Platzhalter), ist es immer die Anschrift der Familie. Datenschutz geht vor: im Zweifel schwärzen.
  zeilenTexte.forEach((t, i) => {
    if (i + 1 >= zeilenTexte.length || !STRASSE.test(t.trim()) || !PLZ_ORT.test(zeilenTexte[i + 1].trim())) return;
    const darueber = (zeilenTexte[i - 1] ?? '').trim(), danach = zeilenTexte.slice(i + 2, i + 4).join(' ');
    if (!/^\[[^\]]+\]$/.test(darueber) && (FIRMA.test(darueber) || KONTAKT.test(danach))) return;
    for (const index of [i, i + 1]) if (!out.some((o) => o.index === index)) out.push({ index, label: '[Adresse]' });
  });
  return out;
}

/** Automatische Balken einer Seite: Liste und IBAN (übernommen, balkenFuer) plus musterBereiche je Zeile. */
export function autoBalken(stuecke: Stueck[], liste: ListenEintrag[]): Balken[] {
  const out: Balken[] = balkenFuer(stuecke, liste.map((e) => ({ text: e.text, label: e.ersatz })), { iban: true });
  const alleZeilen = zeilen(stuecke) as Stueck[][];
  for (const { index, label } of anschriftZeilen(alleZeilen.map((z) => zeileAus(z).text))) {
    const zl = zeileAus(alleZeilen[index]), k = zl.kasten(0, zl.text.length), r = Math.max(2, k.h * 0.18), rx = Math.max(3, k.h * 0.45);
    const neu: Balken = { x: k.x - rx, y: k.y - r, w: k.w + 2 * rx, h: k.h + 2 * r, label, auto: true, quelle: 'anschrift' };
    if (!out.some((b) => ueberlappung(neu, b) > 0.3)) out.push(neu);
  }
  // Felder eines Kundenblocks (Name:, Adresse: …) und Telefonnummern aus der Liste in jeder Schreibweise
  const texte = alleZeilen.map((z) => zeileAus(z).text);
  const extra = [...kundenfelder(texte), ...texte.flatMap((t, index) => telefonTreffer(t, liste).map((x) => ({ index, ...x })))];
  for (const f of extra) {
    const zl = zeileAus(alleZeilen[f.index]), k = zl.kasten(f.start, f.ende), r = Math.max(2, k.h * 0.18), rx = Math.max(3, k.h * 0.45);
    const neu: Balken = { x: k.x - rx, y: k.y - r, w: k.w + 2 * rx, h: k.h + 2 * r, label: f.label, auto: true, quelle: 'kunde' };
    if (!out.some((b) => ueberlappung(neu, b) > 0.3)) out.push(neu);
  }
  for (const z of alleZeilen) {
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
  for (const t of telefonTreffer(text, liste).reverse()) text = text.slice(0, t.start) + t.label + text.slice(t.ende);
  for (const t of nummernTreffer(text).reverse()) text = text.slice(0, t.start) + '[Nummer]' + text.slice(t.ende);
  for (const t of alteDaten(text).reverse()) text = text.slice(0, t.start) + '[Datum]' + text.slice(t.ende);
  return text;
}

/** Zweite Prüfung: Welche Einträge der Schwärzliste stehen (noch) im Text? Leere Liste = sauber. */
export function listenTreffer(text: string, liste: ListenEintrag[]): string[] {
  const t = [...treffer(text, liste.map((e) => ({ text: e.text, label: e.ersatz })), {}), ...telefonTreffer(text, liste)];
  return Array.from(new Set(t.map((x: { start: number; ende: number }) => text.slice(x.start, x.ende))));
}

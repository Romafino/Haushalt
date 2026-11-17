/* Was auf einer Dokumentseite geschwärzt wird (Plan vom 17.11.2026, gezielt statt pauschal). Reines Modul.
   IMMER (jede Seite):
     - Schwärzliste und Nummern-Tresor (Telefon in jeder Schreibweise, Straße/Str./Strasse – Liste vom Aufrufer erweitert)
     - IBAN (Länge passt zum Land), Handynummern
     - Kundennummern hinter einer Bezeichnung (Vertrags-, Kunden-, Versicherungs-, Schaden-, Rechnungsnummer …) mit eigenem Platzhalter
     - Kundenfelder (Name:, Adresse:, Geburtsdatum: …) und Anschriftenblöcke
   NUR AUF SEITEN MIT PERSÖNLICHEM BEZUG (einer der Treffer oben, außer IBAN):
     - andere Nummern hinter einer Bezeichnung, Namen nach Herr/Frau, Geburtsdaten, Daten älter als 15 Jahre
   NIE: Zahlen ohne Bezeichnung (Postleitzahlen, Service-, Register-, Zählernummern, Beträge). */
import { treffer } from './such';
import { ANREDE_RE, GEB_RE, NR_BLEIBT, NR_NACKT, NR_RE } from './text';
import { istMobil, kundenfelder, TECHNIK_DAVOR, telefonTreffer } from './genauer';
import { alteDaten, anschriftZeilen } from './seitentext';
import type { ListenEintrag } from './liste';

export type Bereich = { start: number; ende: number; label: string; art: string };

/** Platzhalter einer Kundennummer nach ihrer Bezeichnung; null = keine Kundennummer (z. B. Register-, Steuernummer der Firma). */
export function kundennummerArt(bezeichnung: string): string | null {
  const b = bezeichnung.toLowerCase();
  if (/vers(icherung|\.|-)|polic|vs-?nr|vsnr/.test(b)) return '[Versicherungsnummer]';
  if (/kund|kd\.?-?nr/.test(b)) return '[Kundennummer]';
  if (/vertrag/.test(b)) return '[Vertragsnummer]';
  if (/schad/.test(b)) return '[Schadennummer]';
  if (/rechn/.test(b)) return '[Rechnungsnummer]';
  if (/mitglied|vorgang|auftrag|akten|geschäfts|gesch\.|buchung|beitragskonto|konto|ihr zeichen|unser zeichen/.test(b)) return '[Nummer]';
  return null;
}

/** Nummern hinter einer Bezeichnung (NR_RE): Kundennummern immer, andere nur auf Seiten mit persönlichem Bezug. */
function bezeichneteNummern(zeile: string): { start: number; ende: number; label: string; kunde: boolean; bezeichnung: string; wert: string }[] {
  const out: { start: number; ende: number; label: string; kunde: boolean; bezeichnung: string; wert: string }[] = [];
  for (const m of zeile.matchAll(new RegExp(NR_RE.source, 'g'))) {
    const a = m[1], w = m[2], rest = (/[.\-/]+$/.exec(w) || [''])[0], wert = w.slice(0, w.length - rest.length);
    if (NR_BLEIBT.test(a) || TECHNIK_DAVOR.test(a) || (NR_NACKT.test(a) && wert.replace(/[^A-Z0-9]/g, '').length < 5)) continue;
    if (!/\d/.test(wert)) continue;
    const art = kundennummerArt(a);
    const start = m.index! + a.length;
    out.push({ start, ende: start + wert.length, label: art ?? '[Nummer]', kunde: !!art, bezeichnung: a.replace(/[\s:.]+$/, ''), wert });
  }
  return out;
}

/** Handynummern in einer Zeile. */
function handys(zeile: string): { start: number; ende: number }[] {
  const out: { start: number; ende: number }[] = [];
  for (const m of zeile.matchAll(/(?:\+|00)?\d[\d\s/().-]{6,}\d/g)) {
    const davor = zeile.slice(Math.max(0, m.index! - 8), m.index!);
    if (istMobil(m[0], davor)) out.push({ start: m.index!, ende: m.index! + m[0].length });
  }
  return out;
}

const PLATZHALTER = /\[[^\]]{1,20}\]/;

/** Je Zeile die zu schwärzenden Bereiche (ohne Überlappungen; früher eingetragene Regeln haben Vorrang). */
export function schutzBereiche(zeilen: string[], liste: ListenEintrag[], heute?: string, immerPersoenlich = false): Bereich[][] {
  const je: Bereich[][] = zeilen.map(() => []);
  const nurPlatzhalter = (t: string) => /^(\s|[,.;:]|\[[^\]]{1,20}\])*$/.test(t); // schon geschwärzt: nicht erneut ersetzen
  const dazu = (i: number, b: Bereich) => { if (!nurPlatzhalter(zeilen[i].slice(b.start, b.ende)) && !je[i].some((x) => x.start < b.ende && b.start < x.ende)) je[i].push(b); };
  let persoenlich = immerPersoenlich;

  // 1. immer
  const eintraege = liste.map((e) => ({ text: e.text, label: e.ersatz }));
  zeilen.forEach((z, i) => {
    for (const t of treffer(z, eintraege, {}) as { start: number; ende: number; label: string }[]) { dazu(i, { ...t, art: 'liste' }); persoenlich = true; }
    for (const t of telefonTreffer(z, liste)) { dazu(i, { ...t, art: 'liste' }); persoenlich = true; }
  });
  for (const a of anschriftZeilen(zeilen)) { dazu(a.index, { start: 0, ende: zeilen[a.index].length, label: a.label, art: 'anschrift' }); persoenlich = true; }
  for (const k of kundenfelder(zeilen)) { dazu(k.index, { start: k.start, ende: k.ende, label: k.label, art: 'kundenfeld' }); persoenlich = true; }
  zeilen.forEach((z, i) => {
    for (const t of treffer(z, [], { iban: true }) as { start: number; ende: number }[]) dazu(i, { ...t, label: '[IBAN]', art: 'iban' });
    for (const t of handys(z)) { dazu(i, { ...t, label: '[Telefon]', art: 'handy' }); persoenlich = true; }
    for (const t of bezeichneteNummern(z)) if (t.kunde) { dazu(i, { start: t.start, ende: t.ende, label: t.label, art: 'kundennummer' }); persoenlich = true; }
  });
  // schon geschwärzte Stellen (Platzhalter im Text) zählen als persönlicher Bezug
  if (!persoenlich && zeilen.some((z) => PLATZHALTER.test(z.replace(/\[(IBAN|Nummer)\]/g, '')))) persoenlich = true;
  if (!persoenlich) return je;

  // 2. nur mit persönlichem Bezug
  zeilen.forEach((z, i) => {
    for (const t of bezeichneteNummern(z)) if (!t.kunde) dazu(i, { start: t.start, ende: t.ende, label: '[Nummer]', art: 'nummer' });
    for (const m of z.matchAll(new RegExp(GEB_RE.source, 'gi'))) dazu(i, { start: m.index! + m[1].length, ende: m.index! + m[0].length, label: '[Geburtsdatum]', art: 'datum' });
    for (const m of z.matchAll(new RegExp(ANREDE_RE.source, 'g'))) { const s = m.index! + m[0].length - m[2].length; dazu(i, { start: s, ende: s + m[2].length, label: '[Name]', art: 'name' }); }
    for (const t of alteDaten(z, heute)) dazu(i, { ...t, label: '[Datum]', art: 'datum' });
  });
  return je;
}

/** Bereiche in einem Text ersetzen (Zeile für Zeile). */
export function ersetzen(text: string, liste: ListenEintrag[], heute?: string, immerPersoenlich = false): string {
  const zeilen = text.split('\n'), je = schutzBereiche(zeilen, liste, heute, immerPersoenlich);
  return zeilen.map((z, i) => je[i].slice().sort((a, b) => b.start - a.start).reduce((t, b) => t.slice(0, b.start) + b.label + t.slice(b.ende), z)).join('\n');
}

/** Für den Tresor: Kundennummern (Art des Tresors) aus dem Originaltext einer Seite – nur auf dem Gerät verwenden. */
export function nummernFinden(zeilen: string[]): { art: 'Vertragsnummer' | 'Kundennummer' | 'Versicherungsnummer' | 'Schadennummer'; nummer: string }[] {
  const ART: Record<string, 'Vertragsnummer' | 'Kundennummer' | 'Versicherungsnummer' | 'Schadennummer'> = {
    '[Vertragsnummer]': 'Vertragsnummer', '[Kundennummer]': 'Kundennummer', '[Versicherungsnummer]': 'Versicherungsnummer', '[Schadennummer]': 'Schadennummer',
  };
  const out: { art: 'Vertragsnummer' | 'Kundennummer' | 'Versicherungsnummer' | 'Schadennummer'; nummer: string }[] = [];
  for (const z of zeilen) for (const t of bezeichneteNummern(z)) {
    const art = ART[t.label];
    if (art && t.wert.length >= 3 && !out.some((x) => x.art === art && x.nummer === t.wert)) out.push({ art, nummer: t.wert.trim() });
  }
  return out;
}

/** Server und KI-Antworten: steht noch etwas Kritisches im (geschwärzten) Text? IBAN, Handynummer, Kundennummer mit echtem Wert. */
export function kritisch(text: string): boolean {
  return text.split('\n').some((z) =>
    (treffer(z, [], { iban: true }) as unknown[]).length > 0 || handys(z).length > 0 || bezeichneteNummern(z).some((t) => t.kunde));
}

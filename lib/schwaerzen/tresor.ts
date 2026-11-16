/* Nummern-Tresor (KONZEPT 13.1): Vertrags-, Kunden-, Versicherungs-, Schadennummern je Bezug (Vertrag, Schadenfall).
   Verschlüsselt mit dem Schlüssel der Schwärzliste (gleiches Passwort). Keine IBAN (entschieden).
   Die Nummern werden beim Schwärzen und Prüfen wie Listeneinträge mit „[Nummer]“ behandelt. Reines Modul. */
import { entschluesseln, verschluesseln } from './krypto';
import { IBAN_RE } from './text';
import type { ListenEintrag } from './liste';

export const ARTEN = ['Vertragsnummer', 'Kundennummer', 'Versicherungsnummer', 'Schadennummer'] as const;
export type Art = (typeof ARTEN)[number];
export type Nummer = { art: Art; nummer: string };
export type Tresor = Record<string, Nummer[]>; // Bezug-ID → Nummern
export type TresorBox = { v: 1; iv: string; daten: string };

/** Fehlertext oder null. */
export function nummerPruefen(n: { art?: unknown; nummer?: unknown }): string | null {
  const t = typeof n.nummer === 'string' ? n.nummer.trim() : '';
  if (!ARTEN.includes(n.art as Art)) return 'Bitte die Art der Nummer wählen.';
  if (t.length < 3 || t.length > 60) return 'Die Nummer muss 3 bis 60 Zeichen lang sein.';
  if (new RegExp(IBAN_RE.source, 'i').test(t)) return 'Eine IBAN gehört nicht in den Tresor.';
  return null;
}

/** Bereinigt einen gelesenen Tresor (unbekannte Felder und ungültige Einträge fallen weg). */
export function tresorAus(roh: unknown): Tresor {
  const out: Tresor = {};
  const n = roh && typeof roh === 'object' ? (roh as { nummern?: unknown }).nummern : null;
  if (!n || typeof n !== 'object') return out;
  for (const [k, l] of Object.entries(n as Record<string, unknown>)) {
    if (!Array.isArray(l)) continue;
    const gut = l.filter((x) => x && !nummerPruefen(x)).map((x) => ({ art: x.art as Art, nummer: String(x.nummer).trim() }));
    if (gut.length) out[k] = gut;
  }
  return out;
}

/** Für das Schwärzen: jede Nummer als Listeneintrag „[Nummer]“, zusätzlich ohne Trennzeichen (HR-7120 6680 → HR71206680). */
export function tresorAlsListe(t: Tresor): ListenEintrag[] {
  const texte = new Set<string>();
  for (const l of Object.values(t)) for (const x of l) {
    texte.add(x.nummer);
    const kompakt = x.nummer.replace(/[\s./-]+/g, '');
    if (kompakt.length >= 3) texte.add(kompakt);
  }
  return [...texte].filter((x) => x.length >= 3).map((text) => ({ text, ersatz: '[Nummer]' }));
}

/** Kündigungsentwurf: [Kundennummer] mit der passenden Nummer füllen (Kunden- vor Versicherungs- vor Vertragsnummer). Nur auf dem Gerät. */
export function mitKundennummer(text: string, nummern: Nummer[] | undefined): string {
  const n = (['Kundennummer', 'Versicherungsnummer', 'Vertragsnummer'] as Art[]).map((a) => nummern?.find((x) => x.art === a)).find(Boolean);
  return n ? text.split('[Kundennummer]').join(n.nummer) : text;
}

export async function tresorVerschluesseln(key: CryptoKey, t: Tresor): Promise<TresorBox> {
  const { iv, daten } = await verschluesseln(key, { nummern: t });
  return { v: 1, iv, daten };
}
export async function tresorOeffnen(key: CryptoKey, box: TresorBox): Promise<Tresor> {
  return tresorAus(await entschluesseln(key, box));
}

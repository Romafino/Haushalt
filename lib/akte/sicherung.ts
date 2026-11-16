/* Datensicherung: Inhalt zusammenstellen, mit Passwort verschlüsseln (PBKDF2-SHA256 + AES-GCM wie die Schwärzliste), wieder öffnen.
   Reines Modul (Browser und Node). Unverschlüsselt in der Datei stehen nur Format, Version und Datum. */
import { entschluesseln, KRYPTO_ITER, neuesSalz, schluesselAus, verschluesseln } from '@/lib/schwaerzen/krypto';

export const FORMAT = 'haushalt-sicherung';
export const VERSION = 1;
export const PASSWORT_MIN = 12;

/** Tabellen der Sicherung in Lade-Reihenfolge (für ein späteres Zurückspielen). Ohne Mitglieder, Geräte, Kalender-Schlüssel, KI-Protokoll. */
export const TABELLEN = [
  'haushalte', 'firmen', 'dinge', 'vertraege', 'vertrag_dinge', 'vertrag_rollen', 'dokumente', 'fassungen', 'belege', 'schadenfaelle',
  'termine', 'ereignisse', 'dokument_seiten', 'dokument_bilder', 'schaden_dinge', 'schaden_pruefungen', 'schaden_fotos', 'fragen', 'schwaerzliste', 'nummern_tresor',
] as const;
export type Tabelle = (typeof TABELLEN)[number];

export type Inhalt = {
  format: typeof FORMAT; version: number; erstellt: string;
  tabellen: Partial<Record<Tabelle, Record<string, unknown>[]>>;
  dateien: Record<string, string>; // Storage-Pfad (bucket/pfad) → JPEG als Base64
};
export type Datei = { format: typeof FORMAT; version: number; erstellt: string; salz: string; iter: number; iv: string; daten: string };

export function inhaltAus(tabellen: Inhalt['tabellen'], dateien: Inhalt['dateien'], jetzt: Date): Inhalt {
  return { format: FORMAT, version: VERSION, erstellt: jetzt.toISOString(), tabellen, dateien };
}

export async function verschluesselt(inhalt: Inhalt, passwort: string, iter = KRYPTO_ITER): Promise<Datei> {
  if (passwort.length < PASSWORT_MIN) throw new Error(`Passwort: mindestens ${PASSWORT_MIN} Zeichen.`);
  const salz = neuesSalz();
  const { iv, daten } = await verschluesseln(await schluesselAus(passwort, salz, iter), inhalt);
  return { format: FORMAT, version: VERSION, erstellt: inhalt.erstellt, salz, iter, iv, daten };
}

/** Öffnet eine Sicherungsdatei. Fehler als verständlicher Text. */
export async function oeffnen(text: string, passwort: string): Promise<Inhalt> {
  let d: Partial<Datei>;
  try { d = JSON.parse(text); } catch { throw new Error('Das ist keine Sicherungsdatei dieser App.'); }
  if (d.format !== FORMAT || typeof d.salz !== 'string' || typeof d.iv !== 'string' || typeof d.daten !== 'string') throw new Error('Das ist keine Sicherungsdatei dieser App.');
  if (Number(d.version) > VERSION) throw new Error('Diese Sicherung stammt aus einer neueren Version der App.');
  let inhalt: Inhalt;
  try { inhalt = await entschluesseln(await schluesselAus(passwort, d.salz, Number(d.iter) || KRYPTO_ITER), { iv: d.iv, daten: d.daten }); }
  catch { throw new Error('Das Passwort passt nicht (oder die Datei ist beschädigt).'); }
  if (inhalt?.format !== FORMAT || typeof inhalt.tabellen !== 'object') throw new Error('Die Sicherung ist unvollständig.');
  return inhalt;
}

/** Was steckt drin? Anzahl je Tabelle (ohne Verworfene) und Dateien. */
export function zusammenfassung(i: Inhalt) {
  const zahl = (t: Tabelle) => (i.tabellen[t] ?? []).filter((z) => !z.verworfen_am).length;
  return {
    erstellt: i.erstellt,
    vertraege: zahl('vertraege'), firmen: zahl('firmen'), dinge: zahl('dinge'), belege: zahl('belege'), dokumente: zahl('dokumente'),
    termine: zahl('termine'), schadenfaelle: zahl('schadenfaelle'), fragen: zahl('fragen'), dateien: Object.keys(i.dateien).length,
    schwaerzliste: (i.tabellen.schwaerzliste ?? []).length > 0,
  };
}

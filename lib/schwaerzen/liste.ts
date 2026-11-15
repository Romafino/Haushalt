/* Schwärzliste: Einträge prüfen, verschlüsselten Block anlegen, öffnen, neu schreiben.
   Läuft im Browser (und in Node für Tests). Klartext und Passwort verlassen nie das Gerät. */
import { entschluesseln, KRYPTO_ITER, neuesSalz, schluesselAus, verschluesseln } from './krypto';

export type ListenEintrag = { text: string; ersatz: string };
export type Box = { v: 1; salz: string; iter: number; iv: string; daten: string };

export const ERSATZ = /^\[[^\]]{1,20}\]$/;
export const PASSWORT_MIN = 12;

/** Prüft die Liste. Gibt je Zeile (Index) einen Fehlertext zurück; leeres Objekt = alles in Ordnung. */
export function listePruefen(liste: ListenEintrag[]): Record<number, string> {
  const fehler: Record<number, string> = {};
  const gesehen = new Map<string, number>();
  liste.forEach((e, i) => {
    const t = e.text.trim();
    if (t.length < 3) fehler[i] = 'Mindestens 3 Zeichen.';
    else if (!ERSATZ.test(e.ersatz.trim())) fehler[i] = 'Platzhalter in eckigen Klammern, höchstens 20 Zeichen, z. B. [Vater].';
    else if (gesehen.has(t.toLowerCase())) fehler[i] = 'Doppelt (siehe Zeile ' + (gesehen.get(t.toLowerCase())! + 1) + ').';
    else gesehen.set(t.toLowerCase(), i);
  });
  return fehler;
}

export const aufraeumen = (l: ListenEintrag[]): ListenEintrag[] =>
  l.map((e) => ({ text: e.text.trim(), ersatz: e.ersatz.trim() })).filter((e) => e.text);

export function passwortPruefen(pw: string): string | null {
  if (pw.length < PASSWORT_MIN) return `Mindestens ${PASSWORT_MIN} Zeichen. Tipp: vier zufällige Wörter.`;
  return null;
}

/** Neue Liste mit neuem Passwort (neues Salz). */
export async function boxAnlegen(passwort: string, liste: ListenEintrag[], iter = KRYPTO_ITER): Promise<{ box: Box; key: CryptoKey }> {
  const salz: string = neuesSalz();
  const key = (await schluesselAus(passwort, salz, iter)) as CryptoKey;
  const { iv, daten } = await verschluesseln(key, { liste });
  return { box: { v: 1, salz, iter, iv, daten }, key };
}

/** Schlüssel aus Passwort ableiten und Liste öffnen. Wirft { code: 'passwort' } bei falschem Passwort. */
export async function boxOeffnen(passwort: string, box: Box): Promise<{ key: CryptoKey; liste: ListenEintrag[] }> {
  const key = (await schluesselAus(passwort, box.salz, box.iter)) as CryptoKey;
  return { key, liste: await mitSchluessel(key, box) };
}

export async function mitSchluessel(key: CryptoKey, box: Box): Promise<ListenEintrag[]> {
  const inhalt = await entschluesseln(key, box);
  return Array.isArray(inhalt?.liste) ? inhalt.liste.filter((e: ListenEintrag) => e && typeof e.text === 'string') : [];
}

/** Liste mit vorhandenem Schlüssel neu verschlüsseln (neuer IV, gleiches Salz). */
export async function boxSchreiben(key: CryptoKey, box: Box, liste: ListenEintrag[]): Promise<Box> {
  const { iv, daten } = await verschluesseln(key, { liste });
  return { ...box, iv, daten };
}

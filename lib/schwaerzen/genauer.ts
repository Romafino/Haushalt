/* Genaueres Schwärzen (Rückmeldung 17.11.2026): weniger Falschtreffer, weniger Lücken. Reines Modul.
   - IBAN nur, wenn die Länge zum Land passt (± 1 Zeichen für Lesefehler der Texterkennung) – Messlokationen (DE + 31 Zeichen) sind keine IBAN
   - technische Kennungen der Energieversorgung (Zähler, Mess-/Marktlokation) bleiben stehen
   - Handynummern werden immer geschwärzt, auch hinter „Telefon:“
   - Felder in Kundenblöcken (Name:, Adresse:, Geburtsdatum:, Kontoinhaber: …) werden geschwärzt
   - Schwärzliste toleranter: Telefonnummern über die Ziffern, Straßennamen mit Straße/Str./Strasse */
import type { ListenEintrag } from './liste';

const IBAN_LAENGE: Record<string, number> = { DE: 22, AT: 20, CH: 21, LI: 21, NL: 18, BE: 16, LU: 20, FR: 27, MC: 27, IT: 27, ES: 24, PT: 25, PL: 28, CZ: 24, DK: 18, SE: 24, NO: 15, FI: 18, GB: 22, IE: 22 };
export function ibanPlausibel(roh: string): boolean {
  const t = roh.replace(/\s+/g, '').toUpperCase(), soll = IBAN_LAENGE[t.slice(0, 2)];
  return soll ? Math.abs(t.length - soll) <= 1 : true;
}

/* Bezeichnungen, hinter denen eine Nummer stehen bleibt (Energie: werden für Zählerstände und Anbieterwechsel gebraucht). */
export const TECHNIK_DAVOR = /(z[äa]e?hler(-?nummer|-?nr\.?)?|z[äa]hlpunkt|mess-?lokation|markt-?lokation|melo|malo)(-?id)?[\s:.#-]*[A-Z0-9]*$/i; // auch mitten in der Kennung (1ESY…, DE000…)

/** Handynummer? (01[5-7]…, +49 1[5-7]…, 0049 1[5-7]…) – davor: Text vor dem Treffer (für eine abgetrennte Vorwahl +49). */
export function istMobil(wert: string, davor = ''): boolean {
  const d = wert.replace(/\D/g, '');
  if (/^01[5-7]\d{7,9}$/.test(d) || /^(49|0049)1[5-7]\d{7,9}$/.test(d)) return true;
  return /^1[5-7]\d{7,9}$/.test(d) && /(\+|00)\s?49[\s/().-]*$/.test(davor);
}

/* Felder eines Kundenblocks: Wert hinter der Bezeichnung wird geschwärzt. Telefon/E-Mail nur, wenn in der Nähe ein Name- oder Adressfeld steht. */
const IMMER: [RegExp, string][] = [
  [/^((?:vor-?|nach-?|familien-?)?name|versicherungsnehmer(?:in)?|kontoinhaber(?:in)?|kunde|kundin|beitragszahler(?:in)?)\s*:\s*/i, '[Name]'],
  [/^(adresse|anschrift|stra(?:ß|ss)e(?:,? hausnummer)?|wohnort|plz,? ort)\s*:\s*/i, '[Adresse]'],
  [/^(geburtsdatum|geboren(?: am)?|geb\.)\s*:\s*/i, '[Geburtsdatum]'],
];
const NAHE: [RegExp, string][] = [
  [/^(telefon|tel\.?|mobil|handy|telefonnummer|rufnummer)\s*:\s*/i, '[Telefon]'],
  [/^(e-?mail(?:-adresse)?)\s*:\s*/i, '[E-Mail]'],
];
export function kundenfelder(zeilenTexte: string[]): { index: number; start: number; ende: number; label: string }[] {
  const out: { index: number; start: number; ende: number; label: string }[] = [];
  const istKunde = (i: number) => IMMER.slice(0, 2).some(([re]) => re.test((zeilenTexte[i] ?? '').trim()));
  zeilenTexte.forEach((roh, i) => {
    const t = roh.replace(/\s+$/, ''), vorn = roh.length - roh.trimStart().length, z = t.trimStart();
    const passt = (re: RegExp) => { const m = re.exec(z); return m && z.length > m[0].length ? m[0].length : 0; };
    for (const [re, label] of IMMER) { const l = passt(re); if (l) { out.push({ index: i, start: vorn + l, ende: t.length, label }); return; } }
    const nah = [-3, -2, -1, 1, 2, 3].some((d) => istKunde(i + d));
    if (nah) for (const [re, label] of NAHE) { const l = passt(re); if (l) { out.push({ index: i, start: vorn + l, ende: t.length, label }); return; } }
  });
  return out;
}

/* Schwärzliste toleranter: Straßennamen in den üblichen Schreibweisen. */
const STR = /(\s?)(straße|strasse|str\.)/i;
export function listeErweitern(liste: ListenEintrag[]): ListenEintrag[] {
  const out = [...liste], da = new Set(liste.map((e) => e.text.toLowerCase()));
  for (const e of liste) {
    const m = STR.exec(e.text);
    if (!m) continue;
    for (const v of [' Straße', ' Str.', ' Strasse', 'straße', 'str.', 'strasse']) {
      const neu = e.text.slice(0, m.index) + v + e.text.slice(m.index + m[0].length);
      if (!da.has(neu.toLowerCase())) { da.add(neu.toLowerCase()); out.push({ text: neu, ersatz: e.ersatz }); }
    }
  }
  return out;
}

/* Telefonnummern aus der Liste über die Ziffern vergleichen (+49/0049 → 0), egal wie geschrieben. */
const TEL_TOKEN = /(?:\+|00)?\d[\d\s/().-]{5,}\d/g;
const ziffernNormal = (t: string) => t.replace(/\D/g, '').replace(/^(0049|49)(?=[1-9])/, '0');
export function telefonTreffer(text: string, liste: ListenEintrag[]): { start: number; ende: number; label: string }[] {
  const nummern = liste.map((e) => ({ d: ziffernNormal(e.text), ersatz: e.ersatz })).filter((x) => x.d.length >= 7 && x.d.length <= 15 && /^\+?[\d\s/().-]+$/.test(liste.find((e) => ziffernNormal(e.text) === x.d)!.text.trim()));
  if (!nummern.length) return [];
  const out: { start: number; ende: number; label: string }[] = [];
  for (const m of text.matchAll(TEL_TOKEN)) {
    const d = ziffernNormal(m[0]), n = nummern.find((x) => x.d === d || (d.length >= 7 && (d.endsWith(x.d.slice(1)) || x.d.endsWith(d.slice(1)))));
    if (n) out.push({ start: m.index!, ende: m.index! + m[0].length, label: n.ersatz });
  }
  return out;
}

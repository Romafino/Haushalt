/* Steckbrief für die Anzeige: deutsche Überschriften, leere Felder weg, Einträge als lesbare Zeilen. Reines Modul. */
const TITEL: Record<string, string> = {
  gefahren: 'Versicherte Gefahren', summen: 'Summen', selbstbeteiligung: 'Selbstbeteiligung', ausschluesse: 'Ausschlüsse',
  pflichten: 'Pflichten', meldefristen: 'Meldefristen', mitversichert: 'Mitversichert', fundstellen: 'Fundstellen',
};
const REIHE = Object.keys(TITEL);

const leer = (w: unknown) => w == null || (typeof w === 'string' && !w.trim()) || (Array.isArray(w) && w.every(leer));

function zeile(x: unknown): string {
  if (x == null) return '';
  if (typeof x !== 'object') return String(x).trim();
  const o = x as Record<string, unknown>;
  if ('was' in o || 'betrag' in o) return [o.was, o.betrag].filter((v) => !leer(v)).join(': ');
  if ('seite' in o || 'klausel' in o || 'thema' in o) return [o.thema, !leer(o.seite) ? 'S. ' + o.seite : '', o.klausel].filter((v) => !leer(v)).join(' · ');
  return Object.values(o).filter((v) => !leer(v)).map(String).join(' · ');
}

export type SteckbriefAbschnitt = { titel: string; zeilen: string[] };

export function steckbriefAnzeige(sb: unknown): SteckbriefAbschnitt[] {
  if (!sb || typeof sb !== 'object') return [];
  const o = sb as Record<string, unknown>;
  const schluessel = [...REIHE.filter((k) => k in o), ...Object.keys(o).filter((k) => !REIHE.includes(k))];
  return schluessel
    .map((k) => ({ titel: TITEL[k] ?? k, zeilen: (Array.isArray(o[k]) ? (o[k] as unknown[]) : [o[k]]).map(zeile).filter(Boolean) }))
    .filter((a) => a.zeilen.length > 0);
}

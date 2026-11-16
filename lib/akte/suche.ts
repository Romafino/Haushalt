/* Direkte Suche ohne KI: Einträge über suche() aus dem Regelmodul (jedes Wort muss vorkommen),
   Dokumentseiten über die Datenbanksuche (Volltext + Trigramm). Hier: Ziele der Treffer und Textausschnitte. Reines Modul. */
import * as R from '@/lib/regeln';
import type { Akte } from './abbilden';

export type EintragTreffer = { col: string; id: string; art: string; titel: string; zusatz?: string; href: string };

const ZIEL: Record<string, (id: string) => string> = {
  vertraege: (id) => `/akte/vertraege/${id}`, firmen: (id) => `/akte/firmen/${id}`, dinge: (id) => `/akte/dinge/${id}`,
  belege: (id) => `/akte/belege/${id}`, fristen: (id) => `/akte/termine/${id}`, dokumente: (id) => `/dokumente/${id}`, schadenfaelle: (id) => `/schaden/${id}`,
};

/** Einträge durchsuchen; Schadenfälle kommen aus eigener Tabelle dazu. Verworfenes ist in der Akte ohnehin nicht enthalten. */
export function eintraegeSuchen(S: Akte, q: string, schadenfaelle: { id: string; titel: string; datum: string; status: string; beschreibung: string }[] = []): EintragTreffer[] {
  if (q.trim().length < 2) return [];
  const mit = { ...S, schadenfaelle: schadenfaelle.map((s) => ({ id: s.id, titel: s.titel, datum: s.datum, status: s.status, beschreibung: s.beschreibung })) };
  return (R.suche(mit, q) as { col: string; id: string; art: string; titel: string; zusatz?: string }[])
    .filter((t) => ZIEL[t.col])
    .map((t) => ({ ...t, href: ZIEL[t.col](t.id) }));
}

/** Ausschnitt um die erste Fundstelle eines Suchworts (auch Wortteil), höchstens ~180 Zeichen. */
export function ausschnitt(text: string, q: string): string {
  const t = text.replace(/\s+/g, ' ').trim(), k = t.toLowerCase();
  const worte = q.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 3).sort((a, b) => b.length - a.length);
  let i = -1;
  for (const w of worte) { i = k.indexOf(w); if (i >= 0) break; }
  if (i < 0) return t.slice(0, 160) + (t.length > 160 ? ' …' : '');
  const von = Math.max(0, i - 60), bis = Math.min(t.length, i + 120);
  return (von ? '… ' : '') + t.slice(von, bis) + (bis < t.length ? ' …' : '');
}

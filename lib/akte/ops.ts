/* Übersetzt Schreib-Schritte des Regelmoduls ({op, col, id, data, entfernen}, wie im Altbestand) in Aufträge für
   public.ops_anwenden (Tabelle, Spalten in snake_case). Reines Modul. */
import { FELDER, zuZeile, type Akte, type Tabelle } from './abbilden';

export type RegelOp = { op: 'add' | 'update' | 'merge' | 'set'; col: string; id?: string; data?: Record<string, unknown>; entfernen?: string[] };
export type DbOp = { art: 'neu' | 'aendern' | 'schluessel'; tabelle: Tabelle; id?: string; schluessel?: string; daten: Record<string, unknown> };

const TABELLE: Record<string, Tabelle> = { vertraege: 'vertraege', fassungen: 'fassungen', fristen: 'termine', ereignisse: 'ereignisse', dinge: 'dinge' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function opsUebersetzen(ops: RegelOp[], S: Pick<Akte, 'fristen' | 'ereignisse'>): DbOp[] {
  return ops.map((o) => {
    const tabelle = TABELLE[o.col];
    if (!tabelle) throw new Error('Sammlung nicht vorgesehen: ' + o.col);
    const daten = zuZeile(tabelle, o.data ?? {});
    if (o.op === 'add') return { art: 'neu', tabelle, daten };
    // IDs der Akte → Datenbank-IDs (Termine/Ereignisse mit Schlüssel tragen in der Akte den Schlüssel als ID)
    const liste = o.col === 'fristen' ? S.fristen : o.col === 'ereignisse' ? S.ereignisse : null;
    const treffer = liste?.find((x) => x.id === o.id);
    const dbId = treffer?.dbId ? String(treffer.dbId) : o.id;
    if (o.op === 'update' || o.op === 'merge') {
      if (o.op === 'merge') for (const f of o.entfernen ?? []) {
        const spalte = (FELDER[tabelle] as Record<string, string>)[f];
        if (spalte) daten[spalte] = null;
      }
      if (!dbId || !UUID.test(dbId)) throw new Error('Ungültige ID für ' + o.col + ': ' + o.id);
      return { art: 'aendern', tabelle, id: dbId, daten };
    }
    if (o.op === 'set') {
      if (dbId && UUID.test(dbId)) return { art: 'aendern', tabelle, id: dbId, daten };
      if (!o.id) throw new Error('set ohne ID');
      return { art: 'schluessel', tabelle, schluessel: o.id, daten };
    }
    throw new Error('Unbekannter Schritt: ' + o.op);
  });
}

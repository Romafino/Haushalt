/* Bestätigten Vorschlag in Speicher-Schritte übersetzen: Dokument-Angaben + Folgen (neue Firma, neuer Vertrag oder
   Ereignis an bestehendem Vertrag, Beleg). Alles geht zusammen mit dem Dokument in EINE Transaktion (dokument_speichern).
   Reines Modul. Die Person entscheidet über jede Folge (auswahl); nichts wird ungefragt angelegt. */
import * as R from '@/lib/regeln';
import { zuZeile, type Akte } from '@/lib/akte/abbilden';
import { opsUebersetzen, type DbOp, type RegelOp } from '@/lib/akte/ops';

type Obj = Record<string, unknown>;
export type Vorschlag = {
  dokument: Obj; firma: Obj; vertrag: Obj; beleg: Obj; bezug: { vertragId: string | null; dingId: string | null; firmaId: string | null };
  steckbrief: Obj | null; ereignis: string | null; ereignisDaten: Obj; unsicher: string[]; datenschutz: Obj;
};
export type Auswahl = {
  firma: string | 'neu' | null;     // bestehende ID, neu anlegen oder keine
  vertrag: string | 'neu' | null;
  dingId: string | null;
  ereignisAnwenden: boolean;
  belegAnlegen: boolean;
  dokument: Obj;                    // in der Oberfläche bestätigte/geänderte Angaben (typ, titel, datum, gueltigVon, gueltigBis)
};

const leer = (o: Obj | null | undefined) => !o || Object.keys(o).length === 0;

/** Vorschlag der Oberfläche: was die KI zugeordnet hat, sonst „neu“, wenn genug Angaben da sind. */
export function startAuswahl(v: Vorschlag): Auswahl {
  return {
    firma: v.bezug.firmaId ?? (v.firma?.name ? 'neu' : null),
    vertrag: v.bezug.vertragId ?? (v.vertrag?.kurzname && v.vertrag?.art ? 'neu' : null),
    dingId: v.bezug.dingId,
    ereignisAnwenden: !!v.ereignis && !!v.bezug.vertragId,
    belegAnlegen: !leer(v.beleg) && v.dokument?.typ === 'Rechnung',
    dokument: { ...v.dokument },
  };
}

export function uebernahme(v: Vorschlag, a: Auswahl, S: Akte, p: { dokumentId: string; heute: string; neueId: () => string }) {
  const ops: DbOp[] = [], hinweise: string[] = [];
  const d = a.dokument;

  let firmaId: string | null = a.firma && a.firma !== 'neu' ? a.firma : null;
  if (a.firma === 'neu' && v.firma?.name) {
    firmaId = p.neueId();
    ops.push({ art: 'neu', tabelle: 'firmen', daten: { id: firmaId, ...zuZeile('firmen', v.firma) } });
    hinweise.push('Neue Firma: ' + v.firma.name);
  }

  let vertragId: string | null = a.vertrag && a.vertrag !== 'neu' ? a.vertrag : null;
  if (a.vertrag === 'neu' && v.vertrag?.kurzname && v.vertrag?.art) {
    vertragId = p.neueId();
    const status = d.typ === 'Angebot' ? 'angebot' : 'aktiv';
    ops.push({ art: 'neu', tabelle: 'vertraege', daten: { id: vertragId, ...zuZeile('vertraege', { ...v.vertrag, firmaId, status }) } });
    ops.push({ art: 'neu', tabelle: 'ereignisse', daten: zuZeile('ereignisse', { datum: d.datum ?? p.heute, typ: 'neu', text: (status === 'angebot' ? 'Angebot' : 'Vertrag') + ' angelegt aus Dokument', vertragId, dokumentId: p.dokumentId }) });
    hinweise.push('Neuer ' + (status === 'angebot' ? 'Angebot' : 'Vertrag') + ': ' + v.vertrag.kurzname + (v.vertrag.fuerWen ? ' (Für wen bitte im Vertrag wählen)' : ''));
  } else if (vertragId && a.ereignisAnwenden && v.ereignis) {
    const vt = S.vertraege.find((x) => x.id === vertragId);
    const e = v.ereignisDaten ?? {};
    const neu = Object.fromEntries(R.FKEYS.filter((k: string) => v.vertrag?.[k] != null).map((k: string) => [k, v.vertrag[k]]));
    const daten: Obj | null =
      v.ereignis === 'erhoehung' ? (v.vertrag?.beitrag != null && e.gueltigAb ? { beitrag: v.vertrag.beitrag, zahlweise: v.vertrag.zahlweise, gueltigAb: e.gueltigAb, zugang: e.zugang ?? d.datum ?? p.heute } : null)
      : v.ereignis === 'nachtrag' ? (e.gueltigAb && Object.keys(neu).length ? { ...neu, gueltigAb: e.gueltigAb } : null)
      : v.ereignis === 'kuendigung' ? (e.zum ? { am: e.zugang ?? d.datum ?? p.heute, zum: e.zum } : null)
      : v.ereignis === 'bestaetigung' ? (e.zum ? { zum: e.zum } : null)
      : null;
    if (!vt) hinweise.push('Vertrag nicht gefunden; Ereignis nicht übernommen.');
    else if (!daten) hinweise.push('Für das Ereignis fehlen Angaben (z. B. „gültig ab“); bitte am Vertrag von Hand eintragen.');
    else {
      const f = R.ereignisFolgen(v.ereignis, vt, { ...daten, dokumentId: p.dokumentId }, S, p.heute);
      ops.push(...opsUebersetzen(f.ops as RegelOp[], S));
      hinweise.push(...f.hinweise);
    }
  }

  if (a.belegAnlegen && !leer(v.beleg)) {
    ops.push({ art: 'neu', tabelle: 'belege', daten: zuZeile('belege', { titel: v.beleg.titel ?? d.titel ?? 'Rechnung', ...v.beleg, datum: d.datum, firmaId, dingId: a.dingId }) });
    hinweise.push('Neuer Beleg' + (v.beleg.arbeitskosten ? ' mit Arbeitskosten für § 35a' : ''));
  }

  const meta = { typ: d.typ, titel: d.titel, datum: d.datum, gueltigVon: d.gueltigVon, gueltigBis: d.gueltigBis, vertragId, dingId: a.dingId, firmaId, steckbrief: v.steckbrief ?? null };
  return { meta, ops, hinweise };
}

/* Umrechnung zwischen Datenbankzeilen (snake_case, Tabellen aus 20261115000300_akte.sql) und der Akte,
   mit der das Regelmodul rechnet (camelCase, wie im Altbestand: S.vertraege, S.fristen …).
   Reines Modul ohne Next.js- und Supabase-Bezug. Verworfene Einträge zählen nirgends mit. */

type Zeile = Record<string, unknown>;
export type Eintrag = Record<string, unknown> & { id: string };

/** Feldzuordnung je Tabelle: Name in der Akte → Spalte in der Datenbank. */
export const FELDER = {
  firmen: { name: 'name', art: 'art', telefon: 'telefon', email: 'email', hotline: 'hotline', web: 'web', notiz: 'notiz' },
  dinge: { name: 'name', kategorie: 'kategorie', hersteller: 'hersteller', modell: 'modell', jahr: 'jahr', status: 'status', notiz: 'notiz' },
  vertraege: {
    kurzname: 'kurzname', art: 'art', firmaId: 'firma_id', status: 'status', beitrag: 'beitrag', zahlweise: 'zahlweise',
    laufzeitende: 'laufzeitende', erstlaufzeitEnde: 'erstlaufzeit_ende', fristWert: 'frist_wert', fristEinheit: 'frist_einheit',
    verlaengerung: 'verlaengerung', abschluss: 'abschluss', beginn: 'beginn', kuendigungsweg: 'kuendigungsweg', online: 'online',
    gekuendigtAm: 'gekuendigt_am', gekuendigtZum: 'gekuendigt_zum', bestaetigt: 'bestaetigt', ersetztDurchId: 'ersetzt_durch_id', notiz: 'notiz',
  },
  fassungen: {
    vertragId: 'vertrag_id', gueltigVon: 'gueltig_von', gueltigBis: 'gueltig_bis', grund: 'grund', beitrag: 'beitrag', zahlweise: 'zahlweise',
    laufzeitende: 'laufzeitende', fristWert: 'frist_wert', fristEinheit: 'frist_einheit', verlaengerung: 'verlaengerung', dokumentId: 'dokument_id',
  },
  belege: {
    titel: 'titel', datum: 'datum', firmaId: 'firma_id', dingId: 'ding_id', betrag: 'betrag', arbeitskosten: 'arbeitskosten', steuer: 'steuer',
    unbar: 'unbar', uebergabe: 'uebergabe', gewArt: 'gew_art', gewaehrleistungBis: 'gewaehrleistung_bis', notiz: 'notiz',
  },
  termine: {
    titel: 'titel', datum: 'datum', notiz: 'notiz', vorlaufTage: 'vorlauf_tage', wiederholung: 'wiederholung_monate', status: 'status',
    erledigtFuer: 'erledigt_fuer', abgeleitet: 'abgeleitet', quelle: 'quelle', vertragId: 'vertrag_id', dingId: 'ding_id', belegId: 'beleg_id',
    kalDatum: 'kal_datum', kalAlt: 'kal_alt', kalTitel: 'kal_titel',
  },
  ereignisse: { datum: 'datum', typ: 'typ', text: 'text', vertragId: 'vertrag_id', dingId: 'ding_id', dokumentId: 'dokument_id' },
} as const;
export type Tabelle = keyof typeof FELDER;

const ZAHLEN = new Set(['beitrag', 'betrag', 'arbeitskosten', 'fristWert', 'jahr', 'vorlaufTage', 'wiederholung']);

/** Zeile → Eintrag der Akte. Leere Felder (null) fehlen im Eintrag, wie im Altbestand. Zahlen werden zu number. */
export function ausZeile(tabelle: Tabelle, z: Zeile): Eintrag {
  const e: Eintrag = { id: String(z.id) };
  for (const [feld, spalte] of Object.entries(FELDER[tabelle])) {
    const w = z[spalte];
    if (w === null || w === undefined) continue;
    e[feld] = ZAHLEN.has(feld) ? Number(w) : w;
  }
  return e;
}

/** Eintrag (oder Teil davon) → Spalten zum Schreiben. Nur bekannte Felder; leere Texte werden zu null. */
export function zuZeile(tabelle: Tabelle, e: Record<string, unknown>): Zeile {
  const z: Zeile = {};
  const felder = FELDER[tabelle] as Record<string, string>;
  for (const [feld, w] of Object.entries(e)) {
    const spalte = felder[feld];
    if (!spalte) continue;
    z[spalte] = w === '' || w === undefined ? null : w;
  }
  return z;
}

export type Rohdaten = {
  haushalt: { einstellungen?: Record<string, unknown> | null } | null;
  firmen: Zeile[]; dinge: Zeile[]; vertraege: Zeile[]; vertrag_dinge: Zeile[]; vertrag_rollen: Zeile[];
  fassungen: Zeile[]; belege: Zeile[]; termine: Zeile[]; ereignisse: Zeile[];
};

export type Akte = {
  firmen: Eintrag[]; dinge: Eintrag[]; vertraege: Eintrag[]; fassungen: Eintrag[]; belege: Eintrag[];
  fristen: Eintrag[]; ereignisse: Eintrag[]; dokumente: Eintrag[]; schadenfaelle: Eintrag[]; zaehler: Eintrag[];
  einst: Record<string, unknown>;
};

const aktiv = (z: Zeile) => !z.verworfen_am;

/** Alle Tabellen eines Haushalts → Akte im Format des Regelmoduls. */
export function akteAus(r: Rohdaten): Akte {
  const vertraege = r.vertraege.filter(aktiv).map((z) => {
    const v = ausZeile('vertraege', z);
    const dinge = r.vertrag_dinge.filter((d) => d.vertrag_id === z.id);
    const haupt = dinge.find((d) => d.haupt) ?? dinge[0];
    if (haupt) v.dingId = String(haupt.ding_id);
    const weitere = dinge.filter((d) => d !== haupt).map((d) => String(d.ding_id)).sort();
    if (weitere.length) v.weitereDingIds = weitere;
    const rollen = r.vertrag_rollen.filter((d) => d.vertrag_id === z.id);
    const hauptRolle = rollen.find((d) => d.haupt) ?? rollen[0];
    if (hauptRolle) v.fuerWen = String(hauptRolle.rolle);
    const weitereRollen = rollen.filter((d) => d !== hauptRolle).map((d) => String(d.rolle)).sort();
    if (weitereRollen.length) v.weitereRollen = weitereRollen;
    if (z.erstellt_am) v.angelegt = String(z.erstellt_am).slice(0, 10);
    return v;
  });
  const fristen = r.termine.filter(aktiv).map((z) => {
    const f = ausZeile('termine', z);
    f.dbId = String(z.id);
    if (z.schluessel) f.id = String(z.schluessel); // Merker zu abgeleiteten Fristen tragen die feste ID, z. B. kb_<vertrag>
    return f;
  });
  const ereignisse = r.ereignisse.filter(aktiv).map((z) => {
    const e = ausZeile('ereignisse', z);
    e.dbId = String(z.id);
    if (z.schluessel) e.id = String(z.schluessel);
    return e;
  });
  return {
    firmen: r.firmen.filter(aktiv).map((z) => ausZeile('firmen', z)),
    dinge: r.dinge.filter(aktiv).map((z) => ausZeile('dinge', z)),
    vertraege,
    fassungen: r.fassungen.filter(aktiv).map((z) => ausZeile('fassungen', z)),
    belege: r.belege.filter(aktiv).map((z) => ausZeile('belege', z)),
    fristen,
    ereignisse,
    dokumente: [], schadenfaelle: [], zaehler: [], // folgen in späteren Schritten
    einst: (r.haushalt?.einstellungen as Record<string, unknown>) ?? {},
  };
}

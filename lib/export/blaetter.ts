/* Lesbarer Export: Tabellenblätter aus der Akte (exportTabellen aus dem Regelmodul) plus Dokumente, Schadenfälle, Prüfungen, Fragen.
   Dateinamen für die ZIP-Datei. Reines Modul. */
import * as R from '@/lib/regeln';
import type { Akte } from '@/lib/akte/abbilden';
import type { Blatt } from './xlsx';

type Z = Record<string, unknown>;
export type Zusatz = { schadenfaelle: Z[]; pruefungen: Z[]; fragen: Z[] };

const GREIFT: Record<string, string> = { ja: 'greift wahrscheinlich', nein: 'greift nicht', unklar: 'unklar' };
const liste = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : Object.values(x ?? {}).filter(Boolean).join(' '))).join('; ') : '');

export function exportBlaetter(S: Akte, z: Zusatz, heute: string): Blatt[] {
  const name = (id: unknown, l: { id: string; [k: string]: unknown }[], k = 'name') => String(l.find((x) => x.id === id)?.[k] ?? '');
  const basis = R.exportTabellen(S, heute) as Record<string, Z[]>;
  delete basis['Schadenfälle']; // stammen hier aus eigenen Tabellen
  const blaetter: Blatt[] = Object.entries(basis).map(([n, zeilen]) => ({ name: n, zeilen }));
  blaetter.push(
    { name: 'Dokumente', zeilen: S.dokumente.map((d) => ({ Titel: d.titel ?? '', Typ: d.typ ?? '', Datum: d.datum ?? '', 'Gültig von': d.gueltigVon ?? '', 'Gültig bis': d.gueltigBis ?? '', Vertrag: name(d.vertragId, S.vertraege, 'kurzname'), Seiten: d.seiten ?? '', Steckbrief: d.steckbrief ? JSON.stringify(d.steckbrief) : '' })) },
    { name: 'Schadenfälle', zeilen: z.schadenfaelle.filter((s) => !s.verworfen_am).map((s) => ({ Schadentag: s.datum, Titel: s.titel, Status: s.status, Beschreibung: s.beschreibung })) },
    { name: 'Schadenprüfungen', zeilen: z.pruefungen.map((p) => ({ Schadenfall: name(p.schaden_id, z.schadenfaelle as { id: string }[], 'titel'), Vertrag: name(p.vertrag_id, S.vertraege, 'kurzname'), Ergebnis: GREIFT[String(p.greift)] ?? p.greift, Begründung: p.begruendung, Fundstellen: liste(p.fundstellen), Ausschlüsse: liste(p.ausschluesse), Selbstbeteiligung: p.selbstbeteiligung ?? '', Pflichten: liste(p.pflichten), Meldefristen: liste(p.fristen), 'Offene Fragen': liste(p.offene_fragen) })) },
    { name: 'Gespeicherte Fragen', zeilen: z.fragen.filter((f) => !f.verworfen_am).map((f) => ({ Datum: String(f.erstellt_am ?? '').slice(0, 10), Stand: f.stichtag, Frage: f.frage, Antwort: f.antwort, 'Für Tochter': f.tochter ?? '' })) },
  );
  return blaetter.filter((b) => b.zeilen.length > 0);
}

/** Datei- und Ordnernamen: lesbar, ohne Sonderzeichen, mit kurzer ID gegen Doppelungen. */
export const dateiname = (titel: unknown, id: string) =>
  (String(titel ?? '').normalize('NFC').replace(/[^\p{L}\p{N} ._-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'ohne Titel') + ' ' + id.slice(0, 8);

export const LIESMICH = (stand: string) => `Haushalt – lesbarer Export vom ${stand}

haushalt.xlsx      Alle Tabellen (Verträge, Fassungen, Firmen, Dinge, Belege, §35a, Termine, Zeitleiste, Dokumente, Schadenfälle, Fragen).
                   Öffnet mit Excel, Numbers, LibreOffice oder Google Tabellen.
dokumente/         Je Dokument ein Ordner mit dem geschwärzten Text jeder Seite (und, falls gewählt, den geschwärzten Seitenbildern).
schaden/           Je Schadenfall die Fotos (falls gewählt). Achtung: Schadenfotos sind NICHT geschwärzt.

Diese Datei ist NICHT verschlüsselt. Bitte sicher aufbewahren (z. B. verschlüsselter Ordner oder USB-Stick).
Namen und Anschrift der Familie stehen hier nicht drin – die gibt es nur in der verschlüsselten Schwärzliste.
Zum vollständigen Zurückspielen dient die verschlüsselte Sicherung (Datensicherung in der App, oder ohne App: sicherung-oeffnen.html).
`;

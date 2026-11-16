/* Stand der Fachregeln (KONZEPT 13.7): je Regel Rechtsgrundlage, „gilt ab“ und „geprüft am“.
   Recherche am 16.11.2026 über Websuche (Sekundärquellen; amtlicher Text bei gesetze-im-internet.de war aus der Arbeitsumgebung nicht abrufbar) [prüfen].
   §35a mit Fassungen je Steuerjahr: alte Jahre rechnen mit der damals gültigen Regel. Reines Modul. */

export type Regel = { name: string; inhalt: string; grundlage: string; giltAb: string; geprueftAm: string; quellen: string[]; hinweis?: string };

export const GEPRUEFT = '2026-11-16';

export const REGELN: Record<string, Regel> = {
  kuendigung: {
    name: 'Kündigen bis', inhalt: 'Vertragsende minus Kündigungsfrist aus dem Vertrag; Monate per Kalendermonat ab dem Tag nach dem letzten Vertragstag, Wochen × 7, Tage direkt. Maßgeblich ist der Zugang beim Anbieter.',
    grundlage: 'Vertrag; für Versicherungen § 11 VVG (Frist 1 bis 3 Monate, stillschweigende Verlängerung höchstens 1 Jahr, bei mehr als 3 Jahren Laufzeit ab dem 3. Jahr mit 3 Monaten kündbar)',
    giltAb: '2008-01-01', geprueftAm: GEPRUEFT, quellen: ['https://lxgesetze.de/vvg/11', 'https://www.gesetze-im-internet.de/vvg_2008/__11.html'],
  },
  verbraucherLaufzeit: {
    name: 'Verlängerte Verbraucherverträge', inhalt: 'Nach stillschweigender Verlängerung auf unbestimmte Zeit jederzeit mit höchstens einem Monat Frist kündbar (Verträge ab 1.3.2022; Altverträge nach alter Fassung).',
    grundlage: '§ 309 Nr. 9 BGB (Gesetz für faire Verbraucherverträge)', giltAb: '2022-03-01', geprueftAm: GEPRUEFT,
    quellen: ['https://www.datev-magazin.de/nachrichten-steuern-recht/recht/stillschweigende-verlaengerung-eines-vertrags-durch-agb-ab-dem-1-maerz-gelten-fuer-verbrauchervertraege-neue-regeln-74415'],
    hinweis: 'Gilt nicht für Versicherungsverträge (dort § 11 VVG) [prüfen].',
  },
  sonderkuendigung: {
    name: 'Sonderkündigung nach Beitragserhöhung', inhalt: 'Innerhalb eines Monats nach Zugang der Mitteilung; wirkt frühestens zum Zeitpunkt der Erhöhung.',
    grundlage: '§ 40 VVG', giltAb: '2008-01-01', geprueftAm: GEPRUEFT, quellen: ['https://lxgesetze.de/vvg/40'],
  },
  kfz: {
    name: 'Kfz-Versicherung zum Jahresende', inhalt: 'Bei Ablauf 31.12. und einem Monat Frist muss die Kündigung bis 30.11. zugehen. Abweichende Hauptfälligkeit verschiebt den Stichtag.',
    grundlage: 'AKB des Vertrags, § 11 VVG', giltAb: '2008-01-01', geprueftAm: GEPRUEFT, quellen: ['https://finanztip.de/kfz-versicherung/kuendigen/'],
  },
  gewaehrleistung: {
    name: 'Gewährleistung', inhalt: 'Kauf: 2 Jahre ab Ablieferung; Bauwerk (auch Baumaterial dafür): 5 Jahre; Werkleistung am Bauwerk: 5 Jahre ab Abnahme; sonstige Werkleistung (z. B. Reparatur einer Sache): 2 Jahre ab Abnahme.',
    grundlage: '§ 438 BGB (Kauf), § 634a BGB (Werkvertrag)', giltAb: '2002-01-01', geprueftAm: GEPRUEFT, quellen: ['https://lxgesetze.de/bgb/438', 'https://lxgesetze.de/bgb/634a'],
    hinweis: 'Bei VOB/B-Verträgen abweichende Regeln.',
  },
  steuer35a: {
    name: '§ 35a EStG (haushaltsnah, Handwerker)', inhalt: '20 % der Arbeits-, Fahrt- und Maschinenkosten bei Rechnung und unbarer Zahlung; höchstens 4.000 € (haushaltsnahe Dienstleistungen) und 1.200 € (Handwerkerleistungen) je Haushalt und Jahr.',
    grundlage: '§ 35a Abs. 2 und 3 EStG', giltAb: '2009-01-01', geprueftAm: GEPRUEFT,
    quellen: ['https://lxgesetze.de/estg/35a', 'https://www.cpm-steuerberater.de/news/entry/2026/11/06/9879-handwerkerleistungen-absetzen-2026-%C2%A7-35a-estg-reform-2027'],
    hinweis: 'Geplant (Kabinettsentwurf Einkommensteuerreformgesetz 2027 vom 02.09.2026): Handwerkerleistungen ab 2027 nur 15 %, höchstens 900 €. Noch nicht beschlossen [prüfen].',
  },
};

/** §35a-Werte je Steuerjahr. Neue Fassung (z. B. 2027) hier mit giltAb ergänzen – ältere Jahre rechnen weiter mit ihrer Fassung. */
export const FASSUNGEN_35A: { giltAb: string; prozent: { handwerker: number; haushaltsnah: number }; max: { handwerker: number; haushaltsnah: number } }[] = [
  { giltAb: '2009', prozent: { handwerker: 20, haushaltsnah: 20 }, max: { handwerker: 1200, haushaltsnah: 4000 } }, // gilt ab [prüfen]
];

export function regel35a(jahr: string | number) {
  const j = String(jahr);
  const passend = FASSUNGEN_35A.filter((f) => f.giltAb <= j).sort((a, b) => b.giltAb.localeCompare(a.giltAb));
  return passend[0] ?? FASSUNGEN_35A[0];
}

/** „Regel Stand 11/2026“ */
export const standText = (r: Regel) => `Stand ${r.geprueftAm.slice(5, 7)}/${r.geprueftAm.slice(0, 4)}`;

/** Regeln, deren Prüfung länger als ein Jahr zurückliegt. */
export function veraltet(heute: string): string[] {
  const grenze = String(Number(heute.slice(0, 4)) - 1) + heute.slice(4);
  return Object.entries(REGELN).filter(([, r]) => r.geprueftAm < grenze).map(([k]) => k);
}

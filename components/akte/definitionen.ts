/* Felder der Formulare je Bereich. Auswahlwerte kommen aus dem Regelmodul (ENUM), damit Formular und Regeln übereinstimmen. */
import * as R from "@/lib/regeln";
import type { Pruefung } from "@/lib/akte/freitext";
import type { Tabelle } from "@/lib/akte/abbilden";

export type Option = { wert: string; text: string };
export type Feld = {
  name: string;
  text: string;
  art: "text" | "notiz" | "zahl" | "euro" | "datum" | "wahl" | "janein" | "verweis" | "email" | "tel" | "web";
  pflicht?: boolean;
  optionen?: Option[];
  verweis?: "firmen" | "dinge" | "vertraege";
  pruefung?: Pruefung;
  hilfe?: string;
  gruppe?: string;
};

const opt = (l: string[], texte: Record<string, string> = {}): Option[] => l.map((w) => ({ wert: w, text: texte[w] ?? w }));
export const ZAHLWEISE: Record<string, string> = {
  monatlich: "monatlich", zweimonatlich: "alle 2 Monate", vierteljaehrlich: "vierteljährlich", halbjaehrlich: "halbjährlich",
  jaehrlich: "jährlich", woechentlich: "wöchentlich", vierzehntaegig: "alle 14 Tage", einmalig: "einmalig",
};
export const STATUS_VERTRAG: Record<string, string> = { angebot: "Angebot", aktiv: "aktiv", gekuendigt: "gekündigt", beendet: "beendet", ersetzt: "ersetzt" };
export const VERL: Record<string, string> = { "12m": "verlängert sich um 12 Monate", unbefristet: "danach unbefristet (jederzeit kündbar)", vertrag: "laut Vertrag" };
const STEUER: Record<string, string> = { "-": "keine", handwerker: "Handwerkerleistung (§ 35a)", haushaltsnah: "haushaltsnahe Dienstleistung (§ 35a)" };
const GEW: Record<string, string> = { keine: "keine", kauf: "Kauf (2 Jahre ab Übergabe)", bauwerk: "Bauwerk (5 Jahre ab Abnahme)", wartung: "Wartung/Reparatur (2 Jahre) [prüfen]" };
const DING_STATUS: Record<string, string> = { aktiv: "aktiv", ersetzt: "ersetzt", verkauft: "verkauft" };

export type Bereich = { tabelle: Tabelle; titel: string; einzahl: string; felder: Feld[]; titelFeld: string };

export const BEREICHE: Record<string, Bereich> = {
  vertraege: {
    tabelle: "vertraege", titel: "Verträge", einzahl: "Vertrag", titelFeld: "kurzname",
    felder: [
      { name: "kurzname", text: "Kurzname", art: "text", pflicht: true, pruefung: "streng", hilfe: "z. B. „Hausrat“ oder „Kfz Kombi“" },
      { name: "art", text: "Art", art: "wahl", pflicht: true, optionen: opt(R.ENUM.vertragArt) },
      { name: "firmaId", text: "Firma", art: "verweis", verweis: "firmen" },
      { name: "status", text: "Status", art: "wahl", pflicht: true, optionen: opt(Object.keys(STATUS_VERTRAG), STATUS_VERTRAG) },
      { name: "beitrag", text: "Beitrag", art: "euro", gruppe: "Kosten" },
      { name: "zahlweise", text: "Zahlweise", art: "wahl", optionen: opt(R.ENUM.zahlweise, ZAHLWEISE), gruppe: "Kosten" },
      { name: "abschluss", text: "Abgeschlossen am", art: "datum", gruppe: "Laufzeit" },
      { name: "beginn", text: "Beginn", art: "datum", gruppe: "Laufzeit" },
      { name: "laufzeitende", text: "Laufzeit bis (letzter Vertragstag)", art: "datum", gruppe: "Laufzeit" },
      { name: "fristWert", text: "Kündigungsfrist", art: "zahl", gruppe: "Laufzeit" },
      { name: "fristEinheit", text: "Einheit der Frist", art: "wahl", optionen: opt(R.ENUM.einheit), gruppe: "Laufzeit" },
      { name: "verlaengerung", text: "Ohne Kündigung", art: "wahl", optionen: opt(R.ENUM.verl, VERL), gruppe: "Laufzeit" },
      { name: "kuendigungsweg", text: "Kündigungsweg", art: "text", pruefung: "normal", hilfe: "z. B. „schriftlich per Brief“ oder Postanschrift des Anbieters", gruppe: "Kündigung" },
      { name: "online", text: "Online abgeschlossen (Kündigungsbutton)", art: "janein", gruppe: "Kündigung" },
      { name: "gekuendigtAm", text: "Kündigung versendet am", art: "datum", gruppe: "Kündigung" },
      { name: "gekuendigtZum", text: "Gekündigt zum", art: "datum", gruppe: "Kündigung" },
      { name: "bestaetigt", text: "Kündigung bestätigt", art: "janein", gruppe: "Kündigung" },
      { name: "ersetztDurchId", text: "Ersetzt durch", art: "verweis", verweis: "vertraege", gruppe: "Kündigung" },
      { name: "ablageort", text: "Ablageort des Originals", art: "text", hilfe: "z. B. Ordner Versicherungen, Fach 3 oder Kundenportal", pruefung: "streng" },
      { name: "notiz", text: "Notiz", art: "notiz", pruefung: "streng" },
    ],
  },
  firmen: {
    tabelle: "firmen", titel: "Firmen", einzahl: "Firma", titelFeld: "name",
    felder: [
      { name: "name", text: "Name", art: "text", pflicht: true, pruefung: "normal" },
      { name: "art", text: "Art", art: "wahl", optionen: opt(R.ENUM.firmaArt) },
      { name: "hotline", text: "Schaden-/Störungshotline", art: "tel", pruefung: "keine" },
      { name: "telefon", text: "Telefon", art: "tel", pruefung: "keine" },
      { name: "email", text: "E-Mail", art: "email", pruefung: "keine" },
      { name: "web", text: "Webadresse", art: "web", pruefung: "keine" },
      { name: "notiz", text: "Notiz", art: "notiz", pruefung: "streng" },
    ],
  },
  dinge: {
    tabelle: "dinge", titel: "Dinge", einzahl: "Ding", titelFeld: "name",
    felder: [
      { name: "name", text: "Bezeichnung", art: "text", pflicht: true, pruefung: "streng", hilfe: "z. B. „Heizung“, „Kombi“, „Waschmaschine“" },
      { name: "kategorie", text: "Bereich", art: "wahl", pflicht: true, optionen: opt(R.ENUM.dingKat) },
      { name: "hersteller", text: "Hersteller", art: "text", pruefung: "streng" },
      { name: "modell", text: "Modell", art: "text", pruefung: "normal", hilfe: "keine Serien- oder Fahrgestellnummer" },
      { name: "jahr", text: "Kauf-/Baujahr", art: "zahl" },
      { name: "status", text: "Status", art: "wahl", pflicht: true, optionen: opt(Object.keys(DING_STATUS), DING_STATUS) },
      { name: "notiz", text: "Notiz", art: "notiz", pruefung: "streng" },
    ],
  },
  belege: {
    tabelle: "belege", titel: "Belege", einzahl: "Beleg", titelFeld: "titel",
    felder: [
      { name: "titel", text: "Wofür", art: "text", pflicht: true, pruefung: "streng" },
      { name: "datum", text: "Rechnungsdatum", art: "datum" },
      { name: "firmaId", text: "Firma", art: "verweis", verweis: "firmen" },
      { name: "dingId", text: "Ding", art: "verweis", verweis: "dinge" },
      { name: "betrag", text: "Betrag gesamt", art: "euro" },
      { name: "steuer", text: "Steuer", art: "wahl", pflicht: true, optionen: opt(R.ENUM.steuer, STEUER), gruppe: "§ 35a" },
      { name: "arbeitskosten", text: "davon Arbeits-, Fahrt-, Maschinenkosten", art: "euro", gruppe: "§ 35a" },
      { name: "unbar", text: "unbar bezahlt (Überweisung)", art: "janein", gruppe: "§ 35a" },
      { name: "gewArt", text: "Gewährleistung", art: "wahl", optionen: opt(R.ENUM.gewArt, GEW), gruppe: "Gewährleistung" },
      { name: "uebergabe", text: "Übergabe/Abnahme am", art: "datum", gruppe: "Gewährleistung" },
      { name: "gewaehrleistungBis", text: "Gewährleistung bis (falls abweichend)", art: "datum", gruppe: "Gewährleistung" },
      { name: "notiz", text: "Notiz", art: "notiz", pruefung: "streng" },
    ],
  },
  termine: {
    tabelle: "termine", titel: "Termine", einzahl: "Termin", titelFeld: "titel",
    felder: [
      { name: "titel", text: "Was", art: "text", pflicht: true, pruefung: "streng" },
      { name: "datum", text: "Datum", art: "datum", pflicht: true },
      { name: "vorlaufTage", text: "Erinnern … Tage vorher", art: "zahl", hilfe: "leer = Standard (42 Tage)" },
      { name: "wiederholung", text: "Wiederholen alle … Monate", art: "zahl" },
      { name: "vertragId", text: "Vertrag", art: "verweis", verweis: "vertraege" },
      { name: "dingId", text: "Ding", art: "verweis", verweis: "dinge" },
      { name: "notiz", text: "Notiz", art: "notiz", pruefung: "streng" },
    ],
  },
};

/** Startwerte für neue Einträge. */
export const NEU: Record<string, Record<string, unknown>> = {
  vertraege: { status: "aktiv", art: "Versicherung", zahlweise: "jaehrlich", fristEinheit: "Monate" },
  firmen: {},
  dinge: { status: "aktiv", kategorie: "Haus" },
  belege: { steuer: "-" },
  termine: {},
};

export const ROLLEN = R.ENUM.rolle;

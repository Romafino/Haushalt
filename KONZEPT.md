# Haushalts-App: Konzept für die eigene Web-App

Stand: 15.11.2026. Ergebnis der Konzeptrunde im Chat. Grundlage für die Umsetzung mit Claude Code.
Unsicheres ist mit **[prüfen]** markiert. Entscheidungen der Familie sind mit **Entschieden** markiert.

---

## 1. Ziel

Eine private Web-App für einen Haushalt (Einfamilienhaus im Eigentum, Eltern, volljährige Tochter in einer WG, Kind 2), die zwei bestehende Claude-Artefakte ablöst und vereint:

- **Haushalts-App:** Versicherungen, Verträge, Haus, Auto, Geräte, Belege/Steuer. Überblick, Fristen, Erinnerungen, Fragen an die Akte, Schadenfall.
- **Schwärzer:** Fotos und PDFs schwärzen, mit eigener Liste und frei wählbaren Platzhaltern.

Leitsatz: **Datenschutz geht vor Komfort.** Nichts Ungeschwärztes verlässt das Gerät Richtung KI.
Der Alltag muss einfach sein (Foto machen, prüfen, bestätigen). Der Aufbau darf aufwendig sein.

Oberfläche: mobil zuerst (iPhone), außerdem Mac. Deutsch, ruhig und übersichtlich.

## 2. Nutzer und Rechte

- **Entschieden:** Vater und Mutter mit eigener Anmeldung, **gleiche Rechte** (beide können alles, auch Einstellungen).
- Die Tochter bekommt keinen Zugang. Sie erhält weiterleitbare Antworten („Für Tochter“).
- Personen erscheinen in den Daten nur als **Rollen**: Vater, Mutter, Tochter, Kind 2, dazu eigene Rollen.

## 3. Datenschutz-Regeln (verbindlich)

1. **An eine KI gehen ausschließlich geschwärzte Texte und geschwärzte Bilder.** **Entschieden:** Geschwärzte Inhalte dürfen an Claude oder an eine andere KI gehen.
2. **Schwärzen findet immer auf dem Gerät statt**, auch bei Fotos. Server und KI sehen nie das Original.
3. **Texterkennung nur auf dem Gerät** (**Entschieden**). Sie dient zum Finden der zu schwärzenden Stellen. Gelesen wird das geschwärzte Bild von der KI; der auf dem Gerät erkannte Text geht als Hilfe mit.
4. **Originale:** Gespeichert werden **nur geschwärzte Fassungen** (**Entschieden**). Die Originale bleiben bei der Familie.
   - **Ausnahme (Entschieden):** Fotos vom Schaden (Schadenfall) dürfen ungeschwärzt in der Dateiablage liegen. Sie gehen **nie** an eine KI.
5. **Schwärzliste** (echte Namen, Anschrift, Telefon, E-Mail → Platzhalter): liegt auf dem Server **nur verschlüsselt** (PBKDF2-SHA256 + AES-GCM, im Browser ver- und entschlüsselt). **Entschieden:** ein **gemeinsames Passwort** für beide Eltern. Das Passwort verlässt nie das Gerät.
6. **Nicht gespeichert werden** Vertrags-, Kunden-, Versicherungs-, Schaden- und Rechnungsnummern, IBAN, Geburtsdaten, Ausweisdaten.
7. **Freitext** (Fragen, Schadenbeschreibung) wird vor dem Senden ebenfalls gegen die Schwärzliste ersetzt.
8. **Zweite Prüfung:** Jede KI-Antwort wird auf dem Gerät gegen die entschlüsselte Schwärzliste geprüft. Taucht ein Eintrag auf, warnt die App (dann hat die KI etwas Ungeschwärztes gesehen).
9. **Server und Datenbank in der EU** (**Entschieden (15.11.2026):** Supabase Irland/eu-west-1, da Frankfurt beim Anlegen nicht angeboten wurde; Vercel-Funktionen ebenfalls in Irland/Dublin [prüfen: Regionsbezeichnung]. Nicht die Sammeloption „Europe“ wählen, sie umfasst auch London und Zürich).
10. **Keine Rechts-, Steuer- oder Abschlussberatung**, keine Abschluss- oder Kündigungsempfehlung. „Nicht gefunden“ heißt „unklar“, nie „nicht versichert“. Immer Quelle nennen.

## 4. Umfang

**Entschieden: erste Fassung = Kern + Frag die Akte + Schadenfall.**

**Kern**
- Akte: Firmen, Dinge, Verträge mit Fassungen (gültig von/bis), Belege, Termine, Zeitleiste
- Dokument hochladen: schwärzen, von der KI auslesen lassen, bestätigen; Seiten ergänzen
- Ereignisse mit Folgen (siehe 8), Lebensereignisse (eingebaut und eigene), Kündigungsentwurf
- Fristen, „Jetzt wichtig“, Fixkosten, §35a-Summen je Steuerjahr
- Kalender-Abo und Push-Erinnerungen
- Datenübernahme aus der jetzigen Haushalts-App, Datensicherung (Export/Import)

**Zusätzlich in der ersten Fassung**
- Frag die Akte (siehe 7.2)
- Schadenfall (siehe 7.3)

**Später, Stück für Stück**
- Volltextsuche als eigene Ansicht, Deckungsübersicht, Notfallblatt (PDF), Angebot neben Vertrag
- Zählerstände, Jahres-Check, Excel- und Markdown-Export
- Eigene Auswahlwerte, eigene Texte (Sofortmaßnahmen, Kündigungsvorlage), Verwerfen/Wiederherstellen in der Oberfläche
- Schwärzer als eigener Bereich der App
- Exa (Websuche, z. B. Kündigungsadressen) erst bei Bedarf

## 5. Architektur

```
 iPhone / Mac (Browser, Web-App auf dem Home-Bildschirm)
 ├─ Oberfläche (Next.js, App Router)
 ├─ Gerätearbeit: PDF-Text (pdf.js), Texterkennung (tesseract.js), Balken, Schwärzen
 └─ Schwärzliste: Ver- und Entschlüsselung im Browser
          │  nur geschwärzte Inhalte
          ▼
 Server (Next.js Route Handlers auf Vercel, EU)
 ├─ KI-Schicht: Anbieter austauschbar; Start mit Gemini (entschieden 15.11.2026), Claude bleibt möglich
 ├─ Kalender-Abo (.ics mit geheimem Schlüssel)
 ├─ täglicher Lauf (Vercel Cron): Fristen nachziehen, Push versenden
 └─ Web-Push-Versand
          │
          ▼
 Supabase (Irland, eu-west-1)
 ├─ Auth (2 Personen, 1 Haushalt)
 ├─ Postgres mit Row Level Security, Volltextsuche (deutsch)
 └─ Storage: geschwärzte Bilder, Schadenfotos
```

**Grundsätze**
- Rechenregeln (Fristen, Fassungen, Ereignisfolgen, Kosten, §35a) und Schwärz-Logik sind **eigene, reine Module ohne Bezug zu Next.js**, mit Tests. Sie werden aus den Artefakten übernommen (`logic.js`, `such.js`), nicht neu erfunden.
- Die Oberfläche liest und schreibt direkt bei Supabase; RLS schützt.
- Über den Server laufen nur Dinge mit geheimem Schlüssel oder ohne geöffnete App (KI, Cron, Push, Kalender).
- **KI-Aufrufe laufen mit der Anmeldung der Person**, nicht mit Generalschlüssel. Nur Cron und Push-Versand haben weitergehende Rechte und lesen nur, was sie brauchen.
- KI-Antworten werden immer serverseitig **und** im Browser geprüft (nur bekannte Felder und Werte, Datumsformat JJJJ-MM-TT, keine Nummernfelder, nur vorhandene IDs). Vorlage: `bereinigen()` in `logic.js`.

## 6. Datenmodell

Jede Tabelle hat `haushalt_id`. RLS-Regel überall: **lesen und schreiben nur, wenn der angemeldete Nutzer Mitglied dieses Haushalts ist.** Zu jeder Tabelle gehört ein Test, dass ein fremder Nutzer nichts sieht.

| Tabelle | Inhalt |
|---|---|
| `haushalte` | Name, Einstellungen (Vorlauf in Tagen, Standard 42; Texte; KI-Anbieter je Aufgabe; KI-Limit) |
| `mitglieder` | Haushalt ↔ Nutzer |
| `auswahlwerte` | eigene Rollen, Vertragsarten, Firmenarten, Ding-Bereiche, Dokumenttypen |
| `firmen` | Name, Art, Telefon, E-Mail, Schaden-/Störungshotline, Webadresse, Notiz |
| `dinge` | Bezeichnung, Bereich, Hersteller, Modell, Kauf-/Baujahr, Status (aktiv/ersetzt/verkauft), Notiz |
| `vertraege` | Kurzname, Art, Firma, Status (Angebot → aktiv → gekündigt → beendet/ersetzt), Abschluss, Beginn, Kündigungsweg, online abgeschlossen, gekündigt am/zum, bestätigt, ersetzt durch, Notiz |
| `vertrag_dinge`, `vertrag_rollen` | mehrere Bezüge je Vertrag |
| `fassungen` | Beitrag, Zahlweise, Laufzeitende, Kündigungsfrist + Einheit, Verlängerung; gültig von/bis; Grund; Dokument |
| `belege` | Datum, Firma, Ding, Betrag, Arbeitskosten, Steuer (35a Handwerker/haushaltsnah/–), unbar, Übergabe/Abnahme, Gewährleistungsart, Gewährleistung bis, Schadenfall |
| `termine` | eigene Termine: Datum, Titel, Notiz, Vorlauf, Wiederholung (Monate), erledigt, Bezug |
| `ereignisse` | Zeitleiste je Vertrag/Ding: Datum, Typ, Text, Dokument |
| `dokumente` | Typ, Titel, Datum, gültig von/bis, Zuordnung (Vertrag/Ding/Firma), Seitenzahl, Datenschutzbefund, Ergänzungen |
| `dokument_seiten` | geschwärzter Text je Seite (Volltextindex) |
| `dokument_bilder` | Pfad des geschwärzten Bildes in Storage |
| `steckbriefe` | je Dokument: Gefahren, Summen, Selbstbeteiligung, Ausschlüsse, Pflichten, Meldefristen, Mitversicherte, Fundstellen; gültig von/bis; frühere Fassungen bleiben |
| `schadenfaelle` | Datum, Beschreibung (geschwärzt), Dinge, Status, Meldung, Antwort |
| `schaden_pruefungen` | je Police: greift ja/nein/unklar, Begründung, Fundstellen, Ausschlüsse, SB, Pflichten, Fristen, offene Fragen, Fassung am Schadentag |
| `schaden_fotos` | Schadenfotos (ungeschwärzt erlaubt, nie an KI) |
| `fragen` | gespeicherte Fragen und Antworten (nur Platzhalter-Fassung), nur über Knopf „Zur Akte“ |
| `schwaerzliste` | ein verschlüsselter Block (salz, iter, iv, daten), nie Klartext |
| `push_abos` | Geräte für Web-Push |
| `kalender_zugang` | Hash des geheimen Kalender-Schlüssels |
| `ki_protokoll` | Zeitpunkt, Aufgabe, Anbieter, Umfang, Kosten — **ohne Inhalt** |

**Nicht gespeichert:** abgeleitete Fristen (Kündigen bis, Gewährleistung, Bestätigung fehlt …). Sie werden jedes Mal aus Verträgen, Fassungen und Belegen berechnet, wie heute in `alleFristen()`.

**Löschen**
- Standard: **verwerfen** (Feld `verworfen_am`), wiederherstellbar, zählt nirgends mit.
- **Entschieden:** zusätzlich **endgültig löschen mit Rückfrage**.
- **Entschieden (15.11.2026):** Kaskade: Vertrag nimmt Fassungen und Zeitleiste mit; Dokumente und Belege bleiben und verlieren nur die Zuordnung. Bilder in Storage werden mitgelöscht. Alte Datensicherungen enthalten Gelöschtes weiterhin.

## 7. Abläufe

### 7.1 Dokument

1. **Aufnehmen:** Foto(s) oder PDF.
2. **Auf dem Gerät lesen:** PDF-Textebene; sonst Texterkennung. Schwärzliste muss entsperrt sein.
3. **Automatisch schwärzen:** Balken über Treffer aus Liste und Mustern (IBAN, Zahlen ab 5 Ziffern, Nummern hinter Bezeichnungen wie „Vertrags-Nr.“), Platzhalter im Balken. Im Text dieselben Ersetzungen.
4. **Prüfen:** Bild und Text, Balken ergänzen/entfernen, eigene Platzhalter.
5. **Senden:** geschwärzte Bilder + Text an Server. Server prüft Anmeldung, Größe, **KI-Monatslimit (Entschieden: 10 €, Warnung bei 80 %)**, ruft KI auf, protokolliert ohne Inhalt.
6. **Antwort prüfen, zweimal:** Felder/Werte (Server + Browser) und Abgleich mit der Schwärzliste (Browser).
7. **Bestätigen:** Formular mit Typ, Firma, Datum, Beträgen, Laufzeit, Fristen, Zuordnung (bestehend oder neu anlegen), Ereignis, Beleg, Steckbrief. Unsichere Felder [prüfen].
8. **Speichern in einem Schritt** (Datenbankfunktion/Transaktion): Dokument, Seiten, Bilder, Vertrag, Fassung, Ereignis gemeinsam oder gar nicht.
9. **Folgen:** Fristen neu, Kalender-Abo aktuell, Push wenn eine neue Frist im Vorlauf liegt.

Fehlerfälle: kein Netz → Entwurf auf dem Gerät; KI nicht erreichbar oder Limit → leeres Formular, Seiten trotzdem speichern; Abbruch → nichts gespeichert außer KI-Protokoll.

### 7.2 Frag die Akte

1. Frage tippen oder per Tastatur-Diktat. Frage wird gegen die Schwärzliste ersetzt.
2. **Seiten finden ohne KI:** Postgres-Volltextsuche (deutsch) über `dokument_seiten` + Fundstellen der Steckbriefe, höchstens 12 Seiten. Nur wenn nichts gefunden wird, hilft die KI bei der Auswahl.
3. **Stichtag:** ohne Datum nur laufende Verträge; mit Datum die damals gültige Fassung und der damals gültige Steckbrief (`akteKontext()`, `aktivAm()`, `standAm()`, `steckbriefAm()`).
4. Antwort mit Quelle je Aussage; **Quellen antippbar** (öffnen die Seite).
5. **Platzhalter zurückübersetzen** nur in der Ansicht auf dem Gerät.
6. „Für Tochter“: zweiter Aufruf, ohne Familiendaten; beim Kopieren wählbar, ob Platzhalter oder Namen.
7. **Entschieden:** Speichern nur über Knopf „Zur Akte“, nur Platzhalter-Fassung.

### 7.3 Schadenfall

1. **Sofortmaßnahmen und Hotlines offline verfügbar** (Service Worker).
2. Erfassen: Schadentag, Beschreibung (gegen Liste geschwärzt), betroffene Dinge, Schadenfotos (dürfen ungeschwärzt gespeichert werden, nie an KI).
3. **Prüfen:** je Police, die am Schadentag galt, **ein eigener KI-Aufruf** mit Steckbrief der damaligen Fassung **und** passenden Seiten aus der Volltextsuche.
4. Ergebnis je Police: greift ja/nein/unklar, Fundstelle, Ausschlüsse, SB, Pflichten, Meldefristen, Meldeweg (Hotline), offene Fragen. Regel aus `schadenErgebnis()`: „nein“ ohne Fundstelle/Ausschluss wird „unklar“ (außer andere Sparte); Police ohne Steckbrief = „unklar“.
5. **Pflichten und Meldefristen als Terminvorschläge** mit Push.
6. Verlauf: Meldung, Antwort, Rechnungen, Fristen. Hinweis auf Sonderkündigungsrecht nach Schaden [prüfen].

### 7.4 Erinnerungen und Kalender

- **Entschieden:** Push aufs iPhone. Voraussetzung: App über Safari zum Home-Bildschirm hinzugefügt [Details prüfen: iOS-Version, Berechtigung].
- Kalender-Abo-Link mit geheimem Schlüssel; Alarme je Termin (9 Uhr am Tag, Kündigungsfristen zusätzlich Vorlauf vorher).
- Täglicher Lauf (Vercel Cron, auf Hobby einmal täglich, Zeitpunkt innerhalb der Stunde): Vertragsende eintragen, verpasste Fristen fortschreiben (`wartung()`), Push für Fristen im Vorlauf.

## 8. Fachregeln (aus dem Auftrag und den Artefakten, umgesetzt in `logic.js`)

**Fristen** (im Zweifel gilt die Frist im Vertrag; Zugang beim Anbieter zählt)
- „Kündigen bis“: Monate per Kalendermonat zurück vom **Tag nach** dem letzten Vertragstag, dann einen Tag davor (Monatsende bleibt Monatsende); Wochen ×7; Tage direkt. Tests: 31.12.2026 mit 1 Monat → 30.11.2026; 31.03.2027 mit 6 Wochen → 17.02.2027.
- **Kündigung heute** (`kuendigungJetzt()`): Termin offen → „kündigen bis“; verstrichen + „+12 Monate“ → sofort nächster Termin; verstrichen + „unbefristet“ → „jederzeit kündbar“, Vertragsende frühestens heute + Frist (Wochen/Tage/Monate ab Zugang [prüfen]); verstrichen + „laut Vertrag“ → „unklar, Verlängerung prüfen“.
- Verbraucherverträge ab 1.3.2022: zum Ende der Erstlaufzeit höchstens 1 Monat Frist, danach unbefristet, jederzeit mit höchstens 1 Monat. Ältere: Verlängerung bis 12 Monate, Frist bis 3 Monate.
- Handy/Internet: nach Mindestlaufzeit jederzeit mit 1 Monat.
- Strom/Gas: Sonderkündigung bei Preiserhöhung; Annahme: bis zum Tag vor Wirksamwerden [prüfen].
- Versicherung: Beitragserhöhung → Sonderkündigung binnen 1 Monat ab Zugang; Kfz meist zum 31.12. → Zugang bis 30.11.
- Gewährleistung: Kauf 2 Jahre ab Übergabe; Bauwerk 5 Jahre ab Abnahme; Wartung/Reparatur im Zweifel 2 Jahre [prüfen].
- §35a: nur Arbeits-, Fahrt-, Maschinenkosten; Rechnung + unbare Zahlung. Handwerker 20 %, max. 1.200 €; haushaltsnah 20 %, max. 4.000 € [prüfen]; Kürzung ab 2027 geplant [prüfen].

**Ereignisse und Folgen** (`ereignisFolgen()`, `wartung()`, `dingFolgen()`, `lebensFolgen()`)
- Neue Police: Vertrag, Fassung, Steckbrief, Fristen.
- Nachtrag/Tarifwechsel: neue Fassung gültig ab, neuer Steckbrief, Kosten/Fristen neu, Hinweis bei neuer Laufzeit.
- Beitragserhöhung: neuer Beitrag ab Datum, Sonderkündigung als Termin, Vergleich alt/neu.
- Kündigung versendet: gekündigt zum …, Frist erledigt, „Bestätigung da?“ (+14 Tage), „Abbuchung geprüft?“ (+30 Tage nach Ende), Warnung Ersatz (Kfz).
- Bestätigung: Enddatum fix. Vertragsende: beendet bzw. ersetzt, raus aus Fixkosten und Deckung, Steckbrief bleibt.
- Ersatzvertrag: Lücke/Überschneidung prüfen (braucht Vertragsbeginn).
- Verlängerung ohne Kündigung: fortschreiben bzw. jederzeit kündbar.
- Ding ersetzt/verkauft: verknüpfte Verträge als Prüftermin.
- Lebensereignisse (eingebaut: Tochter zieht um, Studium endet, 25. Geburtstag, Auto verkauft; eigene anlegbar): Aufgaben + Prüftermine für Verträge der Rolle.

**Kündigungsentwurf:** Vorlage mit {Anbieter}, {Datum}, {Vertrag}, {Vertragsende}; Platzhalter [Name], [Adresse], [Kundennummer]; Rechenweg; „Zugang zählt, Versand mit Nachweis“; Kündigungsbutton bei Online-Abschluss.

## 9. Konten und Kosten

| Konto | Zweck | Stand der Recherche (15.11.2026) |
|---|---|---|
| GitHub | Code, Vercel veröffentlicht daraus | kostenlos |
| Supabase | Auth, Datenbank, Storage | Free: 500 MB DB, 1 GB Storage; **pausiert nach 1 Woche Inaktivität; keine automatischen Backups**. Pro ab 25 $/Monat mit täglichen Backups (7 Tage) |
| Vercel | Hosting, Cron | Hobby kostenlos, nur nicht-kommerziell/persönlich; Cron einmal täglich, Zeitpunkt innerhalb der Stunde |
| Anthropic Console | Claude-API | Abrechnung je Nutzung, getrennt vom Claude-Abo [Preise prüfen] |
| weitere KI-Anbieter | optional | eigene Konten; Bedingungen zu Speicherung/Training je Anbieter prüfen |
| Google Gemini API | KI (Start) | **Entschieden (15.11.2026):** Start mit Gemini. Freikontingent nur für Tests mit erfundenen Dokumenten; für echte Dokumente Google-Cloud-Projekt mit aktivem Zahlungskonto (laut Bedingungen für Nutzer in der EU nur bezahlte Dienste; Datennutzung ohne Training) [prüfen: aktuelle Bedingungen und Preise] |

**Entschieden (15.11.2026):** Entwicklung mit erfundenen Daten auf Supabase Free. Free oder Pro wird vor dem Umzug echter Daten entschieden.

## 10. Umzug aus den Artefakten

**Entschieden (16.11.2026):** Kein Umzug. Die Daten der alten App waren nur Tests; die neue App startet leer. Die folgenden Punkte bleiben nur zur Information stehen.

- Haushalts-App erzeugt eine **Datensicherung** (ZIP mit `sicherung.json`, Format 1: Sammlungen firmen, dinge, vertraege, fassungen, dokumente, belege, fristen, ereignisse, schadenfaelle, zaehler; Seiten je Dokument; Einstellungen; verschlüsselte Schwärzliste). Import-Skript in die neuen Tabellen nötig (IDs abbilden, Mehrfachbezüge, Steckbrief in eigene Tabelle).
- Gespeicherte Originale aus der Artefakt-Dateiablage sind teilweise **ungeschwärzt** → **Entschieden (15.11.2026):** beim Umzug **nicht** übernehmen. Sie bleiben bei der Familie.
- Schwärzliste: gleiche Verschlüsselung (PBKDF2 310.000 Iterationen, AES-GCM) → Block kann mit demselben Passwort übernommen werden.
- Zeitpunkt des Umstiegs und Parallelbetrieb noch festlegen.

## 11. Offene Punkte

0. Hinweis Umsetzung: Schritt 6 (Schwärzliste) wurde vor Schritt 5 gezogen, damit beim Dokumenten-Upload Namen automatisch geschwärzt werden. Deutsche Volltextsuche zerlegt keine Komposita (z. B. findet „Einbruch“ nicht „Einbruchdiebstahl“) → in Schritt 8 berücksichtigen.

1. ~~Umzug: Zeitpunkt und Parallelbetrieb~~ → **Entschieden (16.11.2026):** kein Umzug, Start mit leerer App.
2. ~~Kaskade beim endgültigen Löschen~~ → entschieden (Abschnitt 6).
3. Supabase Free oder Pro: vor dem Umzug echter Daten (bis dahin Free).
4. Push auf iOS: technische Voraussetzungen prüfen.
5. Texterkennung auf dem iPhone: Geschwindigkeit und Qualität mit echten Handyfotos (Test im Artefakt „Texterkennung-Test“ steht aus).
6. Tatsächliche KI-Kosten je Dokument/Frage/Schadenfall messen.
7. ~~Wer betreut Updates und Sicherungen~~ → **Entschieden:** Vater, monatlich; die App erinnert per Termin.

## 12. Vorgeschlagene Reihenfolge der Umsetzung

1. Repository, Next.js-Gerüst, Supabase-Projekt (Irland), Auth, Haushalt + Mitglieder, RLS-Grundregel mit Tests.
2. Regeln übernehmen: `logic.js` → TypeScript-Modul, alle Tests portieren und grün.
3. Tabellen der Akte + Oberfläche: Startseite („Jetzt wichtig“, Bereiche, Fixkosten, §35a), Listen, Detailseiten, Formulare.
4. Ereignisse mit Folgen, Fassungen, täglicher Lauf.
5. Dokumentenweg: Gerät (pdf.js, Texterkennung, Schwärzen), KI-Schicht, Prüfungen, Transaktion.
6. Schwärzliste verschlüsselt, gemeinsames Passwort.
7. Kalender-Abo, Push, Web-App-Manifest.
8. Frag die Akte (Volltextsuche), Schadenfall.
9. ~~Umzug der Daten, Parallelbetrieb, Umstieg.~~ Entfällt (kein Umzug, 16.11.2026).

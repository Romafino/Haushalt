# Regeln für Claude in diesem Projekt

Projekt: private Haushalts-App (Next.js, Supabase, KI-Anbindung). Das vollständige Konzept steht in `KONZEPT.md`. Lies es zu Beginn jeder Sitzung, bevor du etwas änderst.

## Kommunikation
- Antworte auf Deutsch und kompakt. Keine langen Fließtexte, außer der Nutzer bittet darum.
- Erfinde keine Fakten, Funktionen oder Preise. Bist du unsicher, recherchiere oder sag es. Markiere Unsicheres mit **[prüfen]**.
- Frag vor allem, was Geld kostet (kostenpflichtige Pläne, neue Projekte), und vor allem, was Daten löscht oder Zugriffsregeln lockert.

## Datenschutz (nicht verhandelbar)
1. An eine KI gehen **nur geschwärzte Texte und Bilder**. Kein Codepfad darf ungeschwärzte Dokumente, Fotos oder Freitexte an einen KI-Anbieter senden. Schadenfotos gehen nie an eine KI.
2. Schwärzen passiert im Browser. Der Server bekommt keine Originale (Ausnahme: Schadenfotos zur Ablage).
3. Echte Namen, Anschrift, Telefon, E-Mail der Familie stehen **nur in der verschlüsselten Schwärzliste**. Nie im Klartext in Datenbank, Logs, Tests, Fixtures oder Commits.
4. Keine Vertrags-, Kunden-, Versicherungs-, Schaden-, Rechnungsnummern, IBAN, Geburtsdaten oder Ausweisdaten speichern. Einzige Ausnahme: Vertrags-, Kunden-, Versicherungs- und Schadennummern im verschlüsselten Nummern-Tresor (KONZEPT 13.1) – nur im Browser ver-/entschlüsselt, nie im Klartext, nie an eine KI.
5. `ki_protokoll` und Server-Logs enthalten **keine Inhalte**, nur Aufgabe, Anbieter, Umfang, Kosten.
6. Testdaten sind immer erfunden (z. B. „Max Mustermann“, „Beispiel Versicherung AG“).

## Sicherheit
- Jede Tabelle hat `haushalt_id` und eine RLS-Regel „nur Mitglieder des Haushalts“. Keine Tabelle ohne RLS. Zu jeder Regel gibt es einen Test, dass ein fremder Nutzer nichts liest und nichts schreibt.
- Der Service-Role-Schlüssel wird nur in Cron und Push-Versand verwendet, nie im Browser, nie in KI-Routen.
- Geheimnisse nur in Umgebungsvariablen (Vercel/Supabase), nie im Code, nie im Chat.
- KI-Antworten nie ungeprüft speichern: Felder und Werte prüfen (Vorbild `bereinigen()`), im Browser zusätzlich gegen die Schwärzliste.

## Code
- Fachregeln (Fristen, Fassungen, Ereignisfolgen, Kosten, §35a, Kündigung heute) und Schwärz-Logik sind **reine Module ohne Next.js-Bezug** unter `lib/regeln` und `lib/schwaerzen`, mit Tests. Vorlage sind `altbestand/haushalts-app/logic.js` und `altbestand/schwaerzer/such.js` samt Tests in `altbestand/tests`. Übernehmen, nicht neu erfinden; Verhalten nur bewusst und mit Test ändern.
- Nichts wird stillschweigend gelöscht: Standard ist verwerfen; endgültiges Löschen nur mit Rückfrage in der Oberfläche.
- Zusammengehörige Schreibvorgänge (z. B. Dokument + Seiten + Vertrag + Ereignis) in einer Transaktion.
- KI-Anbieter über eine austauschbare Schicht ansprechen; Prompts anbieterneutral halten.
- Oberfläche: Deutsch, mobil zuerst (iPhone), ruhig und übersichtlich, hell und dunkel.
- Keine Rechts-, Steuer- oder Abschlussberatung in Texten oder Prompts. „Nicht gefunden“ heißt „unklar“.

## Vor jeder Übergabe an den Nutzer
- Alle Tests grün, inklusive RLS-Tests.
- Sagen, was getestet wurde und was nicht.

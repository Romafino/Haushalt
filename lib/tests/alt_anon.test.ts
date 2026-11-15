/* Übertragen aus altbestand/tests/test_anon.js. Prüfungen unverändert; läuft gegen lib/regeln und lib/schwaerzen. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert';
import { test } from 'vitest';
import * as R from '@/lib/regeln';
import * as SW from '@/lib/schwaerzen';
const L: any = { ...R, ...SW };

test('Altbestand anon', async () => {
  const eq = (a: any, b: any, n: any) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
  const liste = [{ text: 'Max Mustermann', ersatz: '[Vater]' }, { text: 'Mustermann', ersatz: '[Name]' }, { text: 'Musterweg 5', ersatz: '[Adresse]' }, { text: '12345 Musterstadt', ersatz: '[Adresse]' }];
  let r = L.anonymisieren('Herrn\nMax  Mustermann\nMusterweg 5\n12345 Musterstadt\n\nSehr geehrter Herr MUSTERMANN,', liste);
  eq(r.text, 'Herrn\n[Vater]\n[Adresse]\n[Adresse]\n\nSehr geehrter Herr [Name],', 'Liste: Namen und Anschrift, auch mit Umbruch, doppeltem Leerzeichen und Großschreibung');
  eq(r.treffer.liste, 4, 'Liste: 4 Treffer gezählt');
  eq(L.anonymisieren('Mustermann, Max', [{ text: 'Mustermann Max', ersatz: '[Vater]' }]).text, '[Vater]', 'Liste: Komma zwischen den Wörtern');
  r = L.anonymisieren('Versicherungsschein-Nr.: 12.345.678-9\nKundennummer 4711 0815\nVertragsnummer: AB-12345/7 gültig ab 01.01.2026\nIBAN DE89 3704 0044 0532 0130 00\ngeb. 03.05.1970', []);
  eq(r.text, 'Versicherungsschein-Nr.: [Nummer]\nKundennummer [Nummer]\nVertragsnummer: [Nummer] gültig ab 01.01.2026\nIBAN [IBAN]\ngeb. [Geburtsdatum]', 'Muster: Nummern hinter Bezeichnung, IBAN, Geburtsdatum; Vertragsdatum bleibt');
  eq(r.treffer, { liste: 0, iban: 1, geburtsdatum: 1, nummer: 3, name: 0 }, 'Muster: Treffer gezählt');
  eq(L.anonymisieren('Beitrag 120,00 EUR, Laufzeit bis 31.12.2027, Telefon 0800 123456, Rechnungsbetrag 320,00', []).text, 'Beitrag 120,00 EUR, Laufzeit bis 31.12.2027, Telefon 0800 123456, Rechnungsbetrag 320,00', 'Beträge, Laufzeit und Firmentelefon bleiben unverändert');
  eq(L.anonymisieren('Die Kundennummer finden Sie oben. Vertragsnummer siehe Anlage.', []).text, 'Die Kundennummer finden Sie oben. Vertragsnummer siehe Anlage.', 'Bezeichnung ohne Nummer dahinter bleibt');
  eq(L.anonymisieren('ab', [{ text: 'ab', ersatz: '[Name]' }]).text, 'ab', 'zu kurze Listeneinträge werden ignoriert');
  // gemeldeter Fall (Name der Betreuerin hier durch einen erfundenen ersetzt)
  r = L.anonymisieren('Versicherungsvorschlags-Nr. 71206680\n\nEs betreut Sie Versicherungsservice der\nBeispielstädter Sparkasse\nErika Beispiel', []);
  eq(r.text, 'Versicherungsvorschlags-Nr. [Nummer]\n\nEs betreut Sie Versicherungsservice der\nBeispielstädter Sparkasse\n[Ansprechpartner]', 'gemeldeter Fall: unbekannte Nummern-Bezeichnung und Name der Betreuerin, Firma bleibt');
  eq(L.anonymisieren('Ihr Ansprechpartner: Erika Beispiel\nTelefon 069 123456', []).text, 'Ihr Ansprechpartner: [Ansprechpartner]\nTelefon 069 123456', 'Ansprechpartner in derselben Zeile');
  eq(L.anonymisieren('Ihre Beraterin\nFrau Dr. Erika Beispiel-Muster\nBeispiel Versicherung AG', []).text, 'Ihre Beraterin\n[Ansprechpartner]\nBeispiel Versicherung AG', 'Beraterin mit Titel und Doppelname in der Folgezeile');
  eq(L.anonymisieren('Sehr geehrte Frau Beispiel,\nSehr geehrter Herr Dr. Max Muster, wir', []).text, 'Sehr geehrte Frau [Name],\nSehr geehrter Herr [Name], wir', 'Name nach Herr/Frau');
  eq(L.anonymisieren('Antrags-Nr.: A-2026/0815. Tarif-Nr 4711\nAktenzeichen: 12 O 345/26\nIhr Zeichen: MM-77\nKd.-Nr. 998877\nSteuer-ID 12 345 678 901\nKennzeichen F-AB 1234 ist', []).text, 'Antrags-Nr.: [Nummer]. Tarif-Nr [Nummer]\nAktenzeichen: [Nummer]\nIhr Zeichen: [Nummer]\nKd.-Nr. [Nummer]\nSteuer-ID [Nummer]\nKennzeichen [Nummer] ist', 'beliebige Bezeichnungen mit Nr./Zeichen/ID');
  eq(L.anonymisieren('gemäß § 3 Nr. 2 Satz 1 und Abschnitt A Nr. 4.1 der Bedingungen; Telefonnummer 0800 1234567; Service-Nr. 0800 555; Hausnummer 12', []).text, 'gemäß § 3 Nr. 2 Satz 1 und Abschnitt A Nr. 4.1 der Bedingungen; Telefonnummer 0800 1234567; Service-Nr. 0800 555; Hausnummer 12', 'Klauseln (Nr. 2), Telefon und Hausnummer bleiben');
  eq(L.anonymisieren('Nr. 71206680 vom 01.01.2026', []).text, 'Nr. [Nummer] vom 01.01.2026', 'lange Nummer nach bloßem Nr.');
  eq(L.anonymisieren('Ihr Ansprechpartner\nKundenservice Hausrat\nBeispiel Versicherung AG\nPostfach 1234', []).text, 'Ihr Ansprechpartner\nKundenservice Hausrat\nBeispiel Versicherung AG\nPostfach 1234', 'Abteilung statt Person: nichts ersetzt');
  console.log('\nAlle Tests bestanden.');
  // Wortgrenzen und Schreibweisen
  eq(L.anonymisieren('Max Beispiel zahlt max. 1.200 EUR, Maximalbetrag; MAX und max', [{ text: 'Max', ersatz: '[Vater]' }]).text, '[Vater] Beispiel zahlt max. 1.200 EUR, Maximalbetrag; [Vater] und max', 'Vorname allein: trifft „Max“ und „MAX“, nicht „max.“ und nicht „Maximalbetrag“');
  eq(L.anonymisieren('Mustermann, MUSTERMANN, Mustermanns Auto, mustermann@example.org', [{ text: 'mustermann', ersatz: '[Name]' }]).text, '[Name], [Name], Mustermanns Auto, [Name]@example.org', 'klein eingetragen: trifft auch groß geschrieben; kein Treffer mitten im Wort');
  eq(L.anonymisieren('Musterweg 5, Musterweg 55 und Musterweg 5a', [{ text: 'Musterweg 5', ersatz: '[Adresse]' }]).text, '[Adresse], Musterweg 55 und Musterweg 5a', 'Hausnummer: 5 trifft nicht 55 oder 5a');
  // Import-Formate
  eq(L.listeAusText('# meine Liste\nText;Ersatz\nMax Mustermann;[Vater]\n"Musterweg 5";[Adresse]\nMustermann\n12345 Musterstadt\t[Adresse]\nab;[Name]\nErika Mustermann;Mutter\n'), [{ text: 'Max Mustermann', ersatz: '[Vater]' }, { text: 'Musterweg 5', ersatz: '[Adresse]' }, { text: 'Mustermann', ersatz: '[Name]' }, { text: '12345 Musterstadt', ersatz: '[Adresse]' }, { text: 'Erika Mustermann', ersatz: '[Name]' }], 'Import aus Textdatei: Semikolon oder Tab, Kommentar und Kopfzeile übersprungen, fehlender oder falscher Ersatz wird [Name]');
  eq(L.listeAusText(JSON.stringify({ app: 'haushalts-app', art: 'schwaerzliste', liste: [{ text: ' Max Mustermann ', ersatz: '[Vater]' }, { text: 'x' }] })), [{ text: 'Max Mustermann', ersatz: '[Vater]' }], 'Import aus der Export-Datei');
  eq([L.listeAusText('{"foo":1}'), L.listeAusText(''), L.listeAusText('{kaputt')], [null, null, null], 'Import: fremde, leere und kaputte Datei werden abgelehnt');
  console.log('ok  (Zusatz) alle Schwärz-Tests bestanden');
  // gemeldeter Fall: Textdatei mit alten Mac-Zeilenenden (nur CR) und Mac- bzw. Windows-Kodierung (erfundene Daten)
  const soll = [{ text: 'Max Mustermann', ersatz: '[MaMu]' }, { text: 'Beispielstraße', ersatz: '[Strasse]' }, { text: '12345 Grünstädt', ersatz: '[Zuhause]' }, { text: 'Max.Muster@example.org', ersatz: '[mail]' }];
  const zeilen = 'Max Mustermann;[MaMu]\rBeispielstraße ;[Strasse]\r12345 Grünstädt;[Zuhause]\rMax.Muster@example.org;[mail]';
  const mac = Uint8Array.from(zeilen, c => ({ 'ß': 0xA7, 'ü': 0x9F, 'ä': 0x8A })[c] || c.charCodeAt(0)), win = Uint8Array.from(zeilen, c => ({ 'ß': 0xDF, 'ü': 0xFC, 'ä': 0xE4 })[c] || c.charCodeAt(0));
  eq(L.listeAusText(L.dekodiere(mac)), soll, 'gemeldeter Fall: Mac-Kodierung mit CR-Zeilenenden wird vollständig gelesen, Umlaute stimmen');
  eq(L.listeAusText(L.dekodiere(win)), soll, 'Windows-Kodierung mit CR-Zeilenenden ebenso');
  eq(L.listeAusText(L.dekodiere(new TextEncoder().encode(zeilen.replace(/\r/g, '\r\n')))), soll, 'UTF-8 mit Windows-Zeilenenden ebenso');
  eq(L.listeAusText('Max Mustermann;[MaMu]\rBeispielstra�e;[Strasse]'), [{ text: 'Max Mustermann', ersatz: '[MaMu]' }], 'Zeile mit unlesbarem Zeichen wird ausgelassen');
  eq(L.anonymisieren('Mail: max.muster@example.org und MAX.MUSTER@EXAMPLE.ORG', [soll[3]]).text, 'Mail: [mail] und [mail]', 'E-Mail-Adresse trifft unabhängig von Groß-/Kleinschreibung');
  eq(L.anonymisieren('Beispielstraße 12, 12345 Grünstädt', soll).text, '[Strasse] 12, [Zuhause]', 'Straße ohne Hausnummer und PLZ mit Ort, eigene Platzhalter');
  console.log('ok  (Zusatz 2) Importfall bestanden');
});

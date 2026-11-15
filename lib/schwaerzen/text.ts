/* Übernommen aus altbestand/haushalts-app/logic.js: Schwärzen per Liste und Muster, Anonymisierung vor dem Senden an eine KI, Schwärzliste aus Datei lesen. Verhalten unverändert. */
/* eslint-disable @typescript-eslint/no-explicit-any */

const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[  ]?[0-9A-Z]{4}){3,7}(?:[  ]?[0-9A-Z]{1,3})?\b/g;
const GEB_RE = /(geb(?:oren|\.)?(?:\s*am)?:?\s*)\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}/gi;
/* Ersetzt alle gemeldeten Zeichenfolgen (längste zuerst) und fängt IBAN/Geburtsdatum zusätzlich per Muster. */
function schwaerzen(text: any, liste: any) {
  let t = String(text == null ? '' : text);
  const l = (liste || []).filter((x: any) => x && typeof x.text === 'string' && x.text.trim().length >= 3)
    .sort((a: any, b: any) => b.text.length - a.text.length);
  for (const x of l) t = t.split(x.text).join(/^\[[^\]]{1,20}\]$/.test(x.ersatz || '') ? x.ersatz : '[entfernt]');
  return t.replace(IBAN_RE, '[IBAN]').replace(GEB_RE, '$1[Geburtsdatum]');
}

/* ---------- Anonymisierung VOR dem Senden an Claude (nur Text-PDFs) ---------- */
/* Jede Bezeichnung, die auf Nummer, Nr., Zeichen oder ID endet (auch zusammengesetzt), gefolgt von einem Wert mit Ziffer. */
const NR_RE = /((?:[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-]*)?(?:[Nn]ummer|NUMMER|[Nn]r\.?|NR\.?|[Zz]eichen|ZEICHEN|ID|Id)(?![A-Za-zÄÖÜäöüß])[ \t]*[:.]?[ \t]*)((?=[A-Z0-9\-\/\.]* ?[A-Z0-9\-\/\.]*\d)[A-Z0-9][A-Z0-9\-\/\.]*(?![a-zäöüß])(?: [A-Z0-9][A-Z0-9\-\/\.]*(?![a-zäöüß])){0,4})/g;
const NR_BLEIBT = /^(?:tel|fax|ruf|service|hotline|haus|handy|mobil|seite|blatt|info|kunden-?service)/i;
const NR_NACKT = /^(?:nummer|nr\.?)[ \t:.]*$/i;
/* Personennamen: nach Herr/Frau und in den Zeilen nach "Es betreut Sie", "Ihr Ansprechpartner" usw. */
const ANREDE_RE = /\b(Herrn?|Frau)[ \t]+((?:(?:Dr\.|Prof\.)[ \t]+)*[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?(?:[ \t]+[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?)?)/g;
const BETREUT_RE = /(?:Es betreut Sie|Sie werden betreut (?:von|durch)|(?:Ihre?|Ihren|Unsere?)[ \t]+(?:persönlich\w*[ \t]+)?(?:Ansprechpartner|Berater|Betreuer|Vermittler|Sachbearbeiter|Kundenbetreuer|Kundenberater|Vertreter)(?:in)?|\b(?:Sachbearbeiter|Bearbeiter|Ansprechpartner|Berater|Betreuer|Vermittler)(?:in)?[ \t]*:)/;
const NAMENSZEILE = /^(?:(?:Herrn?|Frau|Dr\.|Prof\.)[ \t]+)*[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?(?:[ \t]+(?:von|van|de|zu|der))?(?:[ \t]+[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?){1,2}$/;
const FIRMENWORT = /GmbH|\bAG\b|\bKG\b|\beG\b|\bSE\b|e\.V\.|Sparkasse|Bank|Versicherung|Service|Agentur|Büro|Team|Abteilung|Zentrale|Direktion|Geschäftsstelle|Center|Makler|Vertrieb|Gruppe|Kasse|Verein|Werke|Stadt|Gesellschaft|Straße|Platz|Weg\b|Allee|[Ss]ervice|[Vv]ersicherung|[Bb]etreuung|[Bb]eratung|[Aa]bteilung|[Ss]chaden|[Kk]unden|[Vv]ertrag|[Vv]ertrieb|[Hh]ausrat|[Hh]aftpflicht|[Zz]entrale|[Ll]eistung/;
function ansprechpartner(t: any, zaehl: any) {
  const z = t.split('\n');
  for (let i = 0; i < z.length; i++) {
    const m = BETREUT_RE.exec(z[i]);
    if (!m) continue;
    const rest = z[i].slice(m.index + m[0].length).replace(/^[ \t:]+/, '').trim();
    if (rest && NAMENSZEILE.test(rest) && !FIRMENWORT.test(rest)) { z[i] = z[i].slice(0, z[i].lastIndexOf(rest)) + '[Ansprechpartner]'; zaehl(); continue; }
    for (let j = i + 1; j <= i + 3 && j < z.length; j++) {
      const k = z[j].trim();
      if (k && NAMENSZEILE.test(k) && !FIRMENWORT.test(k)) { z[j] = z[j].replace(k, '[Ansprechpartner]'); zaehl(); break; }
    }
  }
  return z.join('\n');
}
const reEsc = (t: any) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* liste = [{text, ersatz}] vom Gerät. Gibt den ersetzten Text und die Trefferzahlen zurück. */
function anonymisieren(text: any, liste: any) {
  const treffer = { liste: 0, iban: 0, geburtsdatum: 0, nummer: 0, name: 0 };
  let t = String(text == null ? '' : text);
  const l = (liste || []).filter((x: any) => x && typeof x.text === 'string' && x.text.trim().length >= 3).sort((a: any, b: any) => b.text.length - a.text.length);
  for (const x of l) {
    /* Je Wort gilt: wie eingetragen, GROSS oder mit großem Anfangsbuchstaben. So trifft „Max“ nicht „max.“ oder „Maximal“. */
    const wort = (w: any) => '(?:' + Array.from(new Set([w, w.toUpperCase(), w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()])).map(reEsc).join('|') + ')';
    const kern = x.text.trim().split(/\s+/).map(wort).join('[\\s,]+'); let re;
    const fl = x.text.includes('@') ? 'gi' : 'g'; /* E-Mail-Adressen: Groß-/Kleinschreibung egal */
    try { re = new RegExp('(?<![A-Za-zÄÖÜäöüß0-9])' + kern + '(?![A-Za-zÄÖÜäöüß0-9])', fl); } catch { re = new RegExp(kern, fl); }
    t = t.replace(re, () => { treffer.liste++; return /^\[[^\]]{1,20}\]$/.test(x.ersatz || '') ? x.ersatz : '[entfernt]'; });
  }
  t = t.replace(IBAN_RE, () => { treffer.iban++; return '[IBAN]'; });
  t = t.replace(GEB_RE, (m, a) => { treffer.geburtsdatum++; return a + '[Geburtsdatum]'; });
  t = t.replace(NR_RE, (m, a, w) => {
    const ende = (/[.\-\/]+$/.exec(w) || [''])[0], wert = w.slice(0, w.length - ende.length);
    if (NR_BLEIBT.test(a) || (NR_NACKT.test(a) && wert.replace(/[^A-Z0-9]/g, '').length < 5)) return m; /* Telefon und Klauseln wie "Nr. 2" bleiben */
    treffer.nummer++; return a + '[Nummer]' + ende;
  });
  t = ansprechpartner(t, () => { treffer.name++; });
  t = t.replace(ANREDE_RE, (m, a) => { treffer.name++; return a + ' [Name]'; });
  return { text: t, treffer };
}


/* Dateiinhalt lesen, auch wenn er nicht als UTF-8 gespeichert ist (ältere Mac- oder Windows-Kodierung): die Lesart mit den meisten Umlauten gewinnt. */
function dekodiere(bytes: any) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch { /* kein UTF-8 */ }
  const zaehl = (t: any) => (t.match(/[äöüÄÖÜß]/g) || []).length; let best = null;
  for (const enc of ['windows-1252', 'macintosh']) { try { const t = new TextDecoder(enc).decode(u); if (!best || zaehl(t) > zaehl(best)) best = t; } catch { /* Kodierung fehlt in diesem Browser */ } }
  return best == null ? new TextDecoder('utf-8').decode(u) : best;
}
/* Schwärzliste aus einer Datei lesen: entweder die Export-Datei (JSON) oder Text mit einer Zeile je Eintrag: „Text;[Ersatz]“. */
function listeAusText(inhalt: any) {
  const ok = (x: any) => x && typeof x.text === 'string' && x.text.trim().length >= 3;
  const ers = (e: any) => /^\[[^\]]{1,20}\]$/.test(String(e || '').trim()) ? String(e).trim() : '[Name]';
  const t = String(inhalt || '').replace(/^﻿/, '').trim();
  if (t.startsWith('{')) { let b; try { b = JSON.parse(t); } catch { return null; }
    return b && b.app === 'haushalts-app' && b.art === 'schwaerzliste' && Array.isArray(b.liste) ? b.liste.filter(ok).map((x: any) => ({ text: x.text.trim(), ersatz: ers(x.ersatz) })) : null; }
  const out: any[] = [];
  for (const z of t.split(/\r\n|\n|\r/)) { const zeile = z.trim(); if (!zeile || zeile.startsWith('#')) continue; /* auch alte Mac-Zeilenenden (nur CR) */
    const i = zeile.search(/[;\t]/), text = (i < 0 ? zeile : zeile.slice(0, i)).trim().replace(/^"|"$/g, ''), e = i < 0 ? '' : zeile.slice(i + 1).trim().replace(/^"|"$/g, '');
    if (/^text$/i.test(text)) continue; /* Kopfzeile */
    if (text.length >= 3 && !text.includes('\ufffd')) out.push({ text, ersatz: ers(e) }); }
  return out.length ? out : null;
}


export { IBAN_RE, GEB_RE, NR_RE, NR_BLEIBT, NR_NACKT, ANREDE_RE, schwaerzen, anonymisieren, dekodiere, listeAusText };

/* Übernommen aus altbestand/haushalts-app/logic.js (Haushalts-App: reine Rechenregeln, ohne KI, ohne Oberfläche).
   Verhalten unverändert; Typen zunächst grob (any), werden mit den Tabellen in Schritt 3 verfeinert. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { regel35a } from './stand';
import { schwaerzen } from '../schwaerzen/text';

const pad = (n: any) => String(n).padStart(2, '0');
const toD = (iso: any) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toIso = (d: any) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const addDays = (iso: any, n: any) => { const d = toD(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
const addMonths = (iso: any, n: any) => {
  const d = toD(iso); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return toIso(d);
};
const fmt = (iso: any) => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '–';
const diffDays = (a: any, b: any) => Math.round((toD(b).getTime() - toD(a).getTime()) / 86400000);
const heute = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

/* "Kündigen bis": spätester Zugang beim Anbieter.
   Rechenweg: Tag nach dem letzten Vertragstag, davon die Frist zurück, dann ein Tag davor.
   So ergibt Monatsende minus 1 Monat wieder ein Monatsende (31.12. -> 30.11., 30.11. -> 31.10.). */
function kuendigenBis(ende: any, wert: any, einheit: any): any {
  if (!ende || !wert) return null;
  const start = addDays(ende, 1);
  let z;
  if (einheit === 'Monate') z = addMonths(start, -wert);
  else if (einheit === 'Wochen') z = addDays(start, -7 * wert);
  else z = addDays(start, -wert);
  return addDays(z, -1);
}
function rechenweg(ende: any, wert: any, einheit: any) {
  const kb = kuendigenBis(ende, wert, einheit);
  if (!kb) return '';
  const tage = einheit === 'Wochen' ? ' (= ' + 7 * wert + ' Tage)' : '';
  return 'Letzter Vertragstag ' + fmt(ende) + ' − ' + wert + ' ' + (wert === 1 ? einheit.replace(/e$/, '').replace('Wochen', 'Woche') : einheit) + tage +
    ' → Kündigung muss spätestens am ' + fmt(kb) + ' beim Anbieter eingegangen sein.';
}

const TEILER: Record<string, number> = { monatlich: 1, zweimonatlich: 2, vierteljaehrlich: 3, halbjaehrlich: 6, jaehrlich: 12 };
/* Versicherung ist die eingebaute Art und jede eigene Art, die das Wort enthält (z. B. „Fahrradversicherung“). */
const istVers = (v: any) => /versicherung/i.test(v.art || '');
/* wöchentlich und 14-tägig über 52 bzw. 26 Zahlungen im Jahr; einmalige Zahlungen zählen nicht zu den Fixkosten */
const proMonat = (v: any) => { const b = Number(v.beitrag) || 0; return v.zahlweise === 'einmalig' ? 0 : v.zahlweise === 'woechentlich' ? b * 52 / 12 : v.zahlweise === 'vierzehntaegig' ? b * 26 / 12 : b / (TEILER[v.zahlweise] || 1); };
/* 3. Mehrere Bezüge: Hauptbezug plus weitere */
const dingeVon = (v: any) => [v.dingId].concat(v.weitereDingIds || []).filter(Boolean);
const rollenVon = (v: any) => [v.fuerWen].concat(v.weitereRollen || []).filter(Boolean);
const laeuft = (v: any) => v.status === 'aktiv' || v.status === 'gekuendigt';
const fixkosten = (vs: any, fassungen: any, tag: any) => { const m = vs.filter(laeuft).reduce((s: any, v: any) => s + proMonat(tag ? standAm(v, fassungen, tag) : v), 0); return { monat: m, jahr: m * 12 }; };
const jederzeit = (v: any) => v.verlaengerung === 'unbefristet' && !v.laufzeitende;

/* Verpasste Frist: Laufzeit fortschreiben. Gibt null zurück, wenn nichts zu tun ist. */
function fortschreiben(v: any, tag: any): any {
  if (v.status !== 'aktiv' || !v.laufzeitende || !v.fristWert) return null;
  const kb = kuendigenBis(v.laufzeitende, v.fristWert, v.fristEinheit);
  if (kb >= tag) return null;
  if (v.verlaengerung === '12m') {
    let ende = v.laufzeitende, n = 0;
    while (kuendigenBis(ende, v.fristWert, v.fristEinheit) < tag && n < 50) { ende = addDays(addMonths(addDays(ende, 1), 12), -1); n++; }
    return { laufzeitende: ende, text: 'Frist ' + fmt(kb) + ' verstrichen: verlängert bis ' + fmt(ende) };
  }
  if (v.verlaengerung === 'unbefristet') {
    return { laufzeitende: null, erstlaufzeitEnde: v.laufzeitende, text: 'Frist ' + fmt(kb) + ' verstrichen: läuft ab ' + fmt(addDays(v.laufzeitende, 1)) + ' unbefristet, jederzeit kündbar' };
  }
  return { pruefen: true, text: 'Frist ' + fmt(kb) + ' verstrichen: Verlängerung laut Vertrag prüfen' };
}

/* Kündigung, wie sie HEUTE gilt: nächster Termin, jederzeit kündbar oder unklar.
   Eine verstrichene Erstlaufzeit wird hier sofort berücksichtigt, unabhängig davon, ob die App sie schon gespeichert hat. */
const einhText = (w: any, e: any) => w + ' ' + (Number(w) === 1 ? String(e).replace(/e$/, '').replace('Wochen', 'Woche') : e);
const fristEnde = (ab: any, w: any, e: any) => e === 'Monate' ? addMonths(ab, w) : e === 'Wochen' ? addDays(ab, 7 * w) : addDays(ab, w);
function kuendigungJetzt(v: any, tag?: any): any {
  if (!v || v.status !== 'aktiv') return null;
  tag = tag || heute();
  const w = Number(v.fristWert) || 0, e = v.fristEinheit || 'Monate';
  const jederzeitInfo = (erst: any) => { const ende = fristEnde(tag, w, e);
    return { art: 'jederzeit', zum: ende, erstlaufzeitEnde: erst || v.erstlaufzeitEnde || null,
      text: 'Geht die Kündigung heute (' + fmt(tag) + ') beim Anbieter ein, endet der Vertrag am ' + fmt(ende) + ' (' + einhText(w, e) + ' ab Zugang).' }; };
  if (v.laufzeitende && w) {
    const kb = kuendigenBis(v.laufzeitende, w, e);
    if (kb >= tag) return { art: 'termin', bis: kb, zum: v.laufzeitende, text: rechenweg(v.laufzeitende, w, e) };
    if (v.verlaengerung === '12m') { const fo = fortschreiben(v, tag), kb2 = kuendigenBis(fo.laufzeitende, w, e);
      return { art: 'termin', bis: kb2, zum: fo.laufzeitende, verpasst: kb, text: rechenweg(fo.laufzeitende, w, e), hinweis: 'Die Frist zum ' + fmt(v.laufzeitende) + ' (' + fmt(kb) + ') ist verstrichen, der Vertrag hat sich bis ' + fmt(fo.laufzeitende) + ' verlängert.' }; }
    if (v.verlaengerung === 'unbefristet') return Object.assign(jederzeitInfo(v.laufzeitende), { verpasst: kb });
    return { art: 'unklar', verpasst: kb, zum: v.laufzeitende, text: 'Die Frist zum ' + fmt(v.laufzeitende) + ' (' + fmt(kb) + ') ist verstrichen. Wie sich der Vertrag verlängert, steht im Vertrag. Bitte unter „Verlängerung“ eintragen.' };
  }
  if (!v.laufzeitende && (v.verlaengerung === 'unbefristet' || v.erstlaufzeitEnde))
    return w ? jederzeitInfo(null) : { art: 'jederzeit', zum: null, erstlaufzeitEnde: v.erstlaufzeitEnde || null, text: 'Jederzeit kündbar. Die Kündigungsfrist fehlt: bitte im Vertrag nachsehen und eintragen.' };
  return null;
}

/* Gewährleistung: Kauf 2 Jahre ab Übergabe, Bauwerk 5 Jahre ab Abnahme, Wartung/Reparatur 2 Jahre [prüfen]. */
const GEW: Record<string, number> = { kauf: 24, bauwerk: 60, wartung: 24 };
function gewBis(b: any) {
  if (b.gewaehrleistungBis) return b.gewaehrleistungBis;
  const basis = b.uebergabe || b.datum;
  return basis && GEW[b.gewArt] ? addMonths(basis, GEW[b.gewArt]) : null;
}

/* § 35a: nur Arbeitskosten, nur mit unbarer Zahlung. 20 %, Höchstbetrag je Art. */
const MAX35A: Record<string, number> = { handwerker: 1200, haushaltsnah: 4000 };
/* Bewusst erweitert (KONZEPT 13.7): Prozentsatz und Höchstbetrag kommen aus der Fassung des Steuerjahres (regel35a); für alle Jahre bisher 20 % und MAX35A. */
function steuer35a(belege: any, jahr: any) {
  const r: Record<string, any> = {}, f: any = regel35a(jahr);
  for (const art of Object.keys(MAX35A)) {
    const bs = belege.filter((b: any) => b.steuer === art && b.datum && b.datum.slice(0, 4) === String(jahr));
    const arbeit = bs.reduce((s: any, b: any) => s + (Number(b.arbeitskosten) || 0), 0);
    const anr = bs.filter((b: any) => b.unbar).reduce((s: any, b: any) => s + (Number(b.arbeitskosten) || 0), 0);
    r[art] = { anzahl: bs.length, arbeit, anrechenbar: anr, bar: bs.filter((b: any) => !b.unbar).length, ermaessigung: Math.min(anr * f.prozent[art] / 100, f.max[art]) };
  }
  return r;
}

/* Alle Fristen und Termine: manuelle plus abgeleitete. */
function alleFristen(S: any, tag: any) {
  tag = tag || heute();
  const out: any[] = [];
  const overlay = (id: any) => S.fristen.find((f: any) => f.id === id);
  for (const f of S.fristen) if (!f.abgeleitet) out.push({ id: f.id, datum: f.datum, titel: f.titel, notiz: f.notiz, erledigt: f.status === 'erledigt', manuell: true, vertragId: f.vertragId, dingId: f.dingId, schadenId: f.schadenId, vorlauf: Number(f.vorlaufTage) > 0 ? Number(f.vorlaufTage) : undefined, wiederholung: f.wiederholung });
  for (const v of S.vertraege) {
    const kj = kuendigungJetzt(v, tag);
    if (kj && kj.art === 'termin') {
      const o = overlay('kb_' + v.id);
      out.push({ id: 'kb_' + v.id, datum: kj.bis, titel: v.kurzname + ': kündigen bis (Zugang)', notiz: kj.text, erledigt: !!o && o.erledigtFuer === kj.bis, vertragId: v.id });
    } else if (kj && kj.art === 'unklar') {
      const o = overlay('kb_' + v.id);
      out.push({ id: 'kb_' + v.id, datum: kj.verpasst, titel: v.kurzname + ': Kündigungsfrist verstrichen, Verlängerung prüfen', notiz: kj.text, erledigt: !!o && o.erledigtFuer === kj.verpasst, vertragId: v.id, quittierbar: true });
    }
    if (v.status === 'gekuendigt' && !v.bestaetigt) {
      out.push({ id: 'best_' + v.id, datum: v.gekuendigtAm ? addDays(v.gekuendigtAm, 14) : null, titel: v.kurzname + ': Kündigung ohne Bestätigung', notiz: 'Gekündigt zum ' + fmt(v.gekuendigtZum || v.laufzeitende) + '. Bestätigung des Anbieters fehlt.', erledigt: false, vertragId: v.id, immer: true });
    }
  }
  for (const v of S.vertraege) {
    if (v.ersetztDurchId && (v.status === 'gekuendigt' || v.status === 'ersetzt')) {
      const l = lueckePruefung(v, S.vertraege.find((x: any) => x.id === v.ersetztDurchId)), o = overlay('luecke_' + v.id);
      if (l.art === 'luecke' || l.art === 'ueberschneidung') out.push({ id: 'luecke_' + v.id, datum: l.von, titel: v.kurzname + ': ' + (l.art === 'luecke' ? 'Lücke' : 'Überschneidung') + ' beim Ersatzvertrag', notiz: l.text, erledigt: !!o && o.erledigtFuer === l.von, vertragId: v.id, immer: l.art === 'luecke', quittierbar: true });
    } else if (v.status === 'gekuendigt' && S.dinge && istKfz(v, S)) {
      out.push({ id: 'ersatz_' + v.id, datum: v.gekuendigtZum || v.laufzeitende, titel: v.kurzname + ': Ersatzvertrag fehlt', notiz: 'Gekündigt, aber kein Ersatzvertrag verknüpft.', erledigt: false, vertragId: v.id, immer: true });
    }
  }
  for (const b of S.belege) {
    const g = gewBis(b);
    if (g) { const o = overlay('gew_' + b.id); out.push({ id: 'gew_' + b.id, datum: g, titel: 'Gewährleistung endet: ' + (b.titel || 'Beleg'), erledigt: !!o && o.erledigtFuer === g, belegId: b.id, dingId: b.dingId }); }
  }
  return out.sort((a, b) => (a.datum || '') < (b.datum || '') ? -1 : 1);
}
/* "Jetzt wichtig": offen und fällig innerhalb des Vorlaufs (Standard 42 Tage) oder überfällig. */
function wichtig(S: any, tag: any, vorlauf: any) {
  return alleFristen(S, tag).filter(f => !f.erledigt && (f.immer || (f.datum && f.datum <= addDays(tag, f.vorlauf || vorlauf))))
    .map(f => Object.assign({}, f, { ueberfaellig: !!f.datum && f.datum < tag, tage: f.datum ? diffDays(tag, f.datum) : null }));
}

/* ---------- Dokumente: Schwärzen und Vorschlag prüfen (Stufe b) ---------- */
const tief = (v: any, fn: any): any => typeof v === 'string' ? fn(v) : Array.isArray(v) ? v.map(x => tief(x, fn)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tief(x, fn)])) : v;

const ENUM: Record<string, string[]> = {
  typ: ['Police', 'Nachtrag', 'Bedingungen', 'Vertrag', 'Angebot', 'Rechnung', 'Brief', 'Kündigung', 'Bestätigung', 'Bescheid', 'Anleitung'],
  firmaArt: ['Versicherer', 'Anbieter', 'Handwerker', 'Werkstatt', 'Händler'],
  vertragArt: ['Versicherung', 'Strom/Gas', 'Handy/Internet', 'Abo', 'Sonstiges'],
  rolle: ['Familie', 'Vater', 'Mutter', 'Tochter', 'Kind 2'],
  zahlweise: ['monatlich', 'zweimonatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich', 'woechentlich', 'vierzehntaegig', 'einmalig'],
  einheit: ['Monate', 'Wochen', 'Tage'], verl: ['12m', 'unbefristet', 'vertrag'],
  steuer: ['-', 'handwerker', 'haushaltsnah'], gewArt: ['keine', 'kauf', 'bauwerk', 'wartung'],
};
const NUMMERN = /nummer|iban|konto|geburt|ausweis|anschrift|adresse|kundennr|vertragsnr|policennr/i;
/* Macht aus der KI-Antwort einen sicheren Vorschlag: nur bekannte Felder und Werte, keine Nummernfelder, nur vorhandene IDs. */
function bereinigen(res: any, ids: any) {
  res = res && typeof res === 'object' ? res : {};
  const sw = Array.isArray(res.schwaerzen) ? res.schwaerzen : [];
  const fix = (v: any) => tief(v, (t: any) => schwaerzen(t, sw));
  const datum = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const zahl = (v: any) => typeof v === 'number' && isFinite(v) ? v : null;
  const wahl = (v: any, l: any) => l.includes(v) ? v : null;
  const txt = (v: any) => typeof v === 'string' && v.trim() ? schwaerzen(v.trim(), sw) : null;
  const ohneNull = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== false));
  const d = res.dokument || {}, f = res.firma || {}, v = res.vertrag || {}, b = res.beleg || {}, z = res.bezug || {}, ds = res.datenschutz || {};
  const out = {
    dokument: ohneNull({ typ: wahl(d.typ, ENUM.typ) || 'Brief', titel: txt(d.titel), datum: datum(d.datum), gueltigVon: datum(d.gueltigVon), gueltigBis: datum(d.gueltigBis) }),
    firma: ohneNull({ name: txt(f.name), art: wahl(f.art, ENUM.firmaArt), telefon: txt(f.telefon), email: txt(f.email), hotline: txt(f.hotline) }),
    vertrag: ohneNull({ kurzname: txt(v.kurzname), art: wahl(v.art, ENUM.vertragArt), fuerWen: wahl(v.fuerWen, ENUM.rolle), beitrag: zahl(v.beitrag), zahlweise: wahl(v.zahlweise, ENUM.zahlweise),
      abschluss: datum(v.abschluss), beginn: datum(v.beginn), laufzeitende: datum(v.laufzeitende), fristWert: zahl(v.fristWert), fristEinheit: wahl(v.fristEinheit, ENUM.einheit),
      verlaengerung: wahl(v.verlaengerung, ENUM.verl), kuendigungsweg: txt(v.kuendigungsweg), online: v.online === true }),
    beleg: ohneNull({ titel: txt(b.titel), betrag: zahl(b.betrag), arbeitskosten: zahl(b.arbeitskosten), steuer: wahl(b.steuer, ENUM.steuer), unbar: b.unbar === true, gewArt: wahl(b.gewArt, ENUM.gewArt), uebergabe: datum(b.uebergabe) }),
    bezug: { vertragId: ids.vertraege.includes(z.vertragId) ? z.vertragId : null, dingId: ids.dinge.includes(z.dingId) ? z.dingId : null, firmaId: ids.firmen.includes(z.firmaId) ? z.firmaId : null },
    datenschutz: { iban: ds.iban === true, geburtsdatum: ds.geburtsdatum === true, gesundheit: ds.gesundheit === true, ausweis: ds.ausweis === true, policeUngeschwaerzt: ds.policeUngeschwaerzt === true },
    unsicher: Array.isArray(res.unsicher) ? res.unsicher.filter((x: any) => typeof x === 'string') : [],
    schwaerzen: sw, steckbrief: null,
    ereignis: wahl(res.ereignis, ['nachtrag', 'erhoehung', 'kuendigung', 'bestaetigung']),
    ereignisDaten: ohneNull({ gueltigAb: datum((res.ereignisDaten || {}).gueltigAb), zugang: datum((res.ereignisDaten || {}).zugang), zum: datum((res.ereignisDaten || {}).zum) }),
  };
  if (res.steckbrief && typeof res.steckbrief === 'object') {
    const sb = Object.fromEntries(Object.entries(res.steckbrief).filter(([k]) => !NUMMERN.test(k)));
    out.steckbrief = fix(sb);
  }
  return out;
}
/* Seitenplan für das Vorlesen: wie viele Seiten und Bilder je KI-Aufruf. */
function stapel(seiten: any, maxBilder: any) {
  const jeSeite = maxBilder >= 2 ? 2 : 1, n = Math.max(1, Math.min(2, Math.floor(maxBilder / jeSeite)));
  const out: any[] = [];
  for (let i = 0; i < seiten; i += n) out.push({ von: i, bis: Math.min(seiten, i + n) - 1, jeSeite });
  return out;
}

/* ---------- Fassungen, Ereignisse und ihre Folgen (Stufe c) ---------- */
const FKEYS = ['beitrag', 'zahlweise', 'laufzeitende', 'fristWert', 'fristEinheit', 'verlaengerung'];
const eurT = (n: any) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €';
const pick = (o: any, keys: any) => { const r: any = {}; for (const k of keys) if (o[k] != null && o[k] !== '') r[k] = o[k]; return r; };
function fassungAm(v: any, fassungen: any, tag: any) {
  return fassungen.filter((f: any) => f.vertragId === v.id && f.gueltigVon <= tag && (!f.gueltigBis || f.gueltigBis >= tag)).sort((a: any, b: any) => a.gueltigVon < b.gueltigVon ? 1 : -1)[0] || null;
}
/* Vertrag mit den Werten der Fassung, die an diesem Tag galt. Ohne Fassung: der Vertrag selbst. */
function standAm(v: any, fassungen: any, tag: any) {
  const f = fassungAm(v, fassungen || [], tag);
  if (!f) return v;
  const o = Object.assign({}, v);
  for (const k of FKEYS) { if (f[k] != null) o[k] = f[k]; else delete o[k]; }
  return o;
}
/* Steckbrief, der an diesem Tag galt: jüngstes Dokument mit Steckbrief, das am Tag schon und noch gültig war. */
function steckbriefAm(vertragId: any, dokumente: any, tag: any) {
  return dokumente.filter((d: any) => d.vertragId === vertragId && d.steckbrief && (d.gueltigVon || d.datum || '') <= tag && (!d.gueltigBis || d.gueltigBis >= tag))
    .sort((a: any, b: any) => (a.gueltigVon || a.datum || '') < (b.gueltigVon || b.datum || '') ? 1 : -1)[0] || null;
}
/* Schreib-Schritte für eine neue Fassung: offene Fassung schließen (oder Altstand nachtragen), neue anlegen. */
function fassungOps(v: any, werte: any, gueltigVon: any, grund: any, S: any, dokumentId?: any) {
  const ops: any[] = [], offen = S.fassungen.filter((f: any) => f.vertragId === v.id && !f.gueltigBis), vortag = addDays(gueltigVon, -1);
  if (offen.length) for (const f of offen) ops.push({ op: 'update', col: 'fassungen', id: f.id, data: { gueltigBis: f.gueltigVon > vortag ? f.gueltigVon : vortag } });
  else if (S.vertraege.some((x: any) => x.id === v.id)) {
    const von = v.beginn || v.abschluss || v.angelegt || '2000-01-01';
    ops.push({ op: 'add', col: 'fassungen', data: Object.assign(pick(v, FKEYS), { vertragId: v.id, gueltigVon: von < vortag ? von : vortag, gueltigBis: vortag, grund: 'Stand vor der Änderung' }) });
  }
  const neu: any = Object.assign(pick(Object.assign({}, v, werte), FKEYS), { vertragId: v.id, gueltigVon, grund });
  for (const k of FKEYS) if (werte[k] === null) delete neu[k];
  if (dokumentId) neu.dokumentId = dokumentId;
  ops.push({ op: 'add', col: 'fassungen', data: neu });
  return ops;
}
const istKfz = (v: any, S: any) => istVers(v) && (dingeVon(v).some(id => (S.dinge.find((d: any) => d.id === id) || {}).kategorie === 'Auto') || /kfz|auto|pkw/i.test(v.kurzname || ''));
/* Ersatzvertrag: Lücke oder Überschneidung zwischen Ende des alten und Beginn des neuen Vertrags. */
function lueckePruefung(alt: any, neu: any) {
  const ende = alt.gekuendigtZum || alt.laufzeitende, beginn = neu && (neu.beginn || neu.abschluss);
  if (!ende || !beginn) return { art: 'unklar', text: 'Lücke nicht prüfbar: ' + (!ende ? 'Ende des alten Vertrags fehlt' : 'Beginn des Ersatzvertrags fehlt') + '.' };
  const soll = addDays(ende, 1);
  if (beginn > soll) return { art: 'luecke', von: soll, bis: addDays(beginn, -1), text: 'Lücke: vom ' + fmt(soll) + ' bis ' + fmt(addDays(beginn, -1)) + ' besteht kein Vertrag (' + diffDays(soll, beginn) + ' Tage).' };
  if (beginn < soll) return { art: 'ueberschneidung', von: beginn, bis: ende, text: 'Überschneidung: vom ' + fmt(beginn) + ' bis ' + fmt(ende) + ' laufen beide Verträge (' + (diffDays(beginn, ende) + 1) + ' Tage).' };
  return { art: 'nahtlos', text: 'Nahtloser Übergang: alter Vertrag bis ' + fmt(ende) + ', neuer ab ' + fmt(beginn) + '.' };
}

/* Ereignis an einem Vertrag: gibt Schreib-Schritte (ops), Hinweise und den Zeitleisten-Text zurück. Schreibt selbst nichts. */
function ereignisFolgen(typ: any, v: any, e: any, S: any, tag: any) {
  const ops: any[] = [], hinweise: any[] = []; let text = '', datum = tag;
  const termin = (titel: any, d: any, notiz: any) => { ops.push({ op: 'add', col: 'fristen', data: { titel, datum: d, status: 'offen', vertragId: v.id, notiz, angelegt: tag, quelle: typ } }); hinweise.push('Neuer Termin am ' + fmt(d) + ': ' + titel); };
  if (typ === 'erhoehung') {
    const altM = proMonat(v), neuV = { beitrag: e.beitrag, zahlweise: e.zahlweise || v.zahlweise }, neuM = proMonat(neuV);
    datum = e.zugang || tag;
    ops.push(...fassungOps(v, neuV, e.gueltigAb, 'Beitrags-/Preiserhöhung', S, e.dokumentId), { op: 'update', col: 'vertraege', id: v.id, data: neuV });
    const diff = neuM - altM;
    text = 'Beitragsänderung ab ' + fmt(e.gueltigAb) + ': ' + eurT(altM) + ' → ' + eurT(neuM) + ' pro Monat';
    hinweise.push('Vergleich: alt ' + eurT(altM) + ', neu ' + eurT(neuM) + ' pro Monat (' + (diff >= 0 ? '+' : '−') + eurT(Math.abs(diff)) + (altM ? ', ' + (diff >= 0 ? '+' : '−') + (Math.abs(diff) / altM * 100).toFixed(1).replace('.', ',') + ' %' : '') + '). Fixkosten rechnen ab ' + fmt(e.gueltigAb) + ' mit dem neuen Beitrag.');
    if (diff > 0 && istVers(v)) termin(v.kurzname + ': Sonderkündigung nach Beitragserhöhung möglich bis (Zugang)', addMonths(datum, 1), 'Mitteilung zugegangen am ' + fmt(datum) + '. Regel: innerhalb 1 Monat ab Zugang. Im Zweifel gilt die Frist im Vertrag.');
    else if (diff > 0 && v.art === 'Strom/Gas') termin(v.kurzname + ': Sonderkündigung wegen Preiserhöhung möglich bis (Zugang) [prüfen]', addDays(e.gueltigAb, -1), 'Preis steigt ab ' + fmt(e.gueltigAb) + '. Angenommen: Kündigung bis zum Tag vor dem Wirksamwerden. Frist in der Mitteilung prüfen.');
    else if (diff > 0) hinweise.push('Ob ein Sonderkündigungsrecht besteht, steht im Vertrag oder in der Mitteilung.');
  } else if (typ === 'nachtrag') {
    const werte: any = {}; for (const k of FKEYS) if (k in e) werte[k] = e[k] === '' || e[k] == null ? null : e[k];
    const setz: any = {}; for (const k in werte) if (werte[k] !== null) setz[k] = werte[k];
    datum = e.gueltigAb;
    ops.push(...fassungOps(v, werte, e.gueltigAb, 'Nachtrag/Tarifwechsel', S, e.dokumentId), { op: 'merge', col: 'vertraege', id: v.id, data: setz, entfernen: Object.keys(werte).filter(k => werte[k] === null) });
    const neu = Object.assign({}, v, setz); for (const k in werte) if (werte[k] === null) delete neu[k];
    text = 'Nachtrag/Tarifwechsel, gültig ab ' + fmt(e.gueltigAb);
    if (proMonat(neu) !== proMonat(v)) hinweise.push('Kosten neu: ' + eurT(proMonat(v)) + ' → ' + eurT(proMonat(neu)) + ' pro Monat.');
    if (neu.laufzeitende !== v.laufzeitende || neu.fristWert !== v.fristWert || neu.fristEinheit !== v.fristEinheit) {
      const kb = kuendigenBis(neu.laufzeitende, neu.fristWert, neu.fristEinheit), kbAlt = kuendigenBis(v.laufzeitende, v.fristWert, v.fristEinheit);
      hinweise.push('Neue Laufzeit: bis ' + (neu.laufzeitende ? fmt(neu.laufzeitende) : 'unbefristet') + (kb ? ', kündigen bis ' + fmt(kb) : '') + (kbAlt ? ' (vorher ' + fmt(kbAlt) + ')' : '') + '. Der alte Kalendertermin ist damit veraltet.');
    }
    hinweise.push('Der Steckbrief der neuen Fassung kommt aus dem hochgeladenen Nachtrag. Der alte bleibt für frühere Schadenfälle erhalten.');
  } else if (typ === 'kuendigung') {
    const zum = e.zum || v.laufzeitende, am = e.am || tag; datum = am;
    ops.push({ op: 'update', col: 'vertraege', id: v.id, data: { status: 'gekuendigt', gekuendigtAm: am, gekuendigtZum: zum, bestaetigt: false } });
    text = 'Kündigung versendet, gekündigt zum ' + fmt(zum);
    hinweise.push('Status: gekündigt zum ' + fmt(zum) + '. Die Kündigungsfrist ist damit erledigt.');
    hinweise.push('„Bestätigung da?“ erscheint ab ' + fmt(addDays(am, 14)) + ' unter „Jetzt wichtig“, bis du die Bestätigung einträgst.');
    termin(v.kurzname + ': Abbuchung nach Vertragsende geprüft?', addDays(zum, 30), 'Vertrag endet am ' + fmt(zum) + '. Kontoauszug prüfen: Es darf nichts mehr abgebucht werden.');
    const kb = v.status === 'aktiv' ? kuendigenBis(v.laufzeitende, v.fristWert, v.fristEinheit) : null;
    if (kb && am > kb && zum === v.laufzeitende) hinweise.push('Achtung: Die Frist ' + fmt(kb) + ' war beim Versand schon verstrichen. Der Vertrag endet dann möglicherweise erst später. Bestätigung abwarten.');
    if (istKfz(v, S) && !v.ersetztDurchId) hinweise.push('Ersatz nötig: Ohne Kfz-Haftpflicht darf das Auto ab dem ' + fmt(addDays(zum, 1)) + ' nicht fahren. Ersatzvertrag verknüpfen, sobald er da ist.');
    else if (istVers(v) && !v.ersetztDurchId) hinweise.push('Prüfe, ob ab dem ' + fmt(addDays(zum, 1)) + ' ein Ersatzvertrag nötig ist.');
  } else if (typ === 'bestaetigung') {
    const zum = e.zum || v.gekuendigtZum || v.laufzeitende;
    ops.push({ op: 'update', col: 'vertraege', id: v.id, data: { status: 'gekuendigt', bestaetigt: true, gekuendigtZum: zum } });
    text = 'Kündigung bestätigt zum ' + fmt(zum);
    hinweise.push('Enddatum fix: ' + fmt(zum) + '.' + (v.gekuendigtZum && v.gekuendigtZum !== zum ? ' Abweichend von deiner Kündigung (' + fmt(v.gekuendigtZum) + ').' : ''));
    if (v.gekuendigtZum && v.gekuendigtZum !== zum) for (const f of S.fristen.filter((f: any) => f.vertragId === v.id && f.quelle === 'kuendigung' && f.status !== 'erledigt')) ops.push({ op: 'update', col: 'fristen', id: f.id, data: { datum: addDays(zum, 30) } });
  } else if (typ === 'ersatz') {
    const neu = S.vertraege.find((x: any) => x.id === e.ersatzId);
    ops.push({ op: 'update', col: 'vertraege', id: v.id, data: { ersetztDurchId: e.ersatzId } });
    text = 'Ersatzvertrag verknüpft: ' + (neu ? neu.kurzname : '');
    hinweise.push(lueckePruefung(v, neu).text);
  }
  const ev: any = { datum, typ, text, vertragId: v.id }; if (e.dokumentId) ev.dokumentId = e.dokumentId;
  ops.push({ op: 'add', col: 'ereignisse', data: ev });
  return { ops, hinweise, text };
}

/* Läuft beim Öffnen: Vertragsende eintragen und verpasste Fristen fortschreiben. Feste IDs, damit nichts doppelt entsteht. */
function wartung(S: any, tag: any) {
  const ops: any[] = [];
  for (const v of S.vertraege) {
    const ende = v.gekuendigtZum || v.laufzeitende;
    if (v.status === 'gekuendigt' && ende && ende < tag) {
      ops.push({ op: 'update', col: 'vertraege', id: v.id, data: { status: v.ersetztDurchId ? 'ersetzt' : 'beendet' } });
      for (const f of S.fassungen.filter((f: any) => f.vertragId === v.id && !f.gueltigBis)) ops.push({ op: 'update', col: 'fassungen', id: f.id, data: { gueltigBis: ende } });
      ops.push({ op: 'set', col: 'ereignisse', id: 'auto_' + v.id + '_ende', data: { datum: ende, typ: 'ende', text: 'Vertrag beendet. Raus aus Fixkosten und aktiver Deckung, Steckbrief bleibt für Altfälle.', vertragId: v.id } });
      continue;
    }
    const fo = fortschreiben(v, tag);
    if (fo && !fo.pruefen) {
      const ab = addDays(v.laufzeitende, 1);
      ops.push(...fassungOps(v, { laufzeitende: fo.laufzeitende }, ab, 'Verlängerung ohne Kündigung', S));
      ops.push({ op: 'merge', col: 'vertraege', id: v.id, data: fo.laufzeitende ? { laufzeitende: fo.laufzeitende } : { erstlaufzeitEnde: v.laufzeitende }, entfernen: fo.laufzeitende ? [] : ['laufzeitende'] });
      ops.push({ op: 'set', col: 'ereignisse', id: 'auto_' + v.id + '_verl_' + (fo.laufzeitende || 'unbefristet'), data: { datum: ab, typ: 'verlaengerung', text: fo.text, vertragId: v.id } });
    }
  }
  return ops;
}
/* Ding ersetzt oder verkauft: zugehörige laufende Verträge zur Prüfung vorlegen. */
function dingFolgen(d: any, altStatus: any, S: any, tag: any) {
  const ops: any[] = [], hinweise: any[] = [];
  if ((altStatus || 'aktiv') !== 'aktiv' || !['ersetzt', 'verkauft'].includes(d.status)) return { ops, hinweise };
  for (const v of S.vertraege.filter((v: any) => dingeVon(v).includes(d.id) && laeuft(v))) {
    const titel = 'Prüfen: ' + v.kurzname + ' nach ' + (d.status === 'verkauft' ? 'Verkauf' : 'Ersatz') + ' von ' + d.name;
    ops.push({ op: 'add', col: 'fristen', data: { titel, datum: addDays(tag, 7), status: 'offen', vertragId: v.id, dingId: d.id, notiz: 'Vertrag kündigen, übertragen oder anpassen?', angelegt: tag, quelle: 'ding' } });
    hinweise.push('Neuer Termin am ' + fmt(addDays(tag, 7)) + ': ' + titel);
  }
  const gew = S.belege.filter((b: any) => b.dingId === d.id && gewBis(b) && gewBis(b) >= tag);
  if (gew.length) hinweise.push(gew.length + ' Beleg(e) mit laufender Gewährleistung hängen an ' + d.name + '. Unterlagen bei Verkauf mitgeben oder aufbewahren.');
  ops.push({ op: 'add', col: 'ereignisse', data: { datum: tag, typ: 'ding', text: d.status === 'verkauft' ? 'Verkauft' : 'Ersetzt', dingId: d.id } });
  return { ops, hinweise };
}
/* Lebensereignisse: nur Aufgaben zum Prüfen, keine Beratung. */
const LEBEN: Record<string, any> = {
  umzug: { name: 'Tochter zieht um', rolle: 'Tochter', aufgaben: ['Hausrat und Haftpflicht: Mitversicherung der Tochter am neuen Wohnort prüfen', 'Adresse der Tochter bei Versicherern und Anbietern ändern', 'Kindergeld: neue Anschrift der Familienkasse melden [prüfen]'] },
  studienende: { name: 'Studium der Tochter endet', rolle: 'Tochter', aufgaben: ['Kindergeld: Ende der Ausbildung der Familienkasse melden', 'Ausbildungsfreibetrag: Anspruch nach Studienende prüfen [prüfen]', 'Mitversicherung der Tochter (Haftpflicht, Hausrat, Krankenversicherung) prüfen'] },
  geburtstag25: { name: '25. Geburtstag der Tochter', rolle: 'Tochter', aufgaben: ['Kindergeld: Anspruch endet in der Regel mit 25 [prüfen]', 'Krankenversicherung: Ende der Familienversicherung prüfen [prüfen]', 'Mitversicherung in Haftpflicht und Hausrat prüfen', 'Ausbildungsfreibetrag prüfen [prüfen]'] },
  autoverkauf: { name: 'Auto verkauft', aufgaben: ['Kfz-Versicherung: Verkauf dem Versicherer melden', 'Zulassungsstelle: Verkauf anzeigen oder Abmeldung prüfen', 'Kfz-Steuer: Ende der Steuerpflicht prüfen [prüfen]'] },
};
function lebensFolgen(def: any, datum: any, S: any, tag: any, dingId: any) {
  if (typeof def === 'string') def = LEBEN[def];
  const ops: any[] = [], hinweise: any[] = [];
  const neu = (titel: any, extra: any) => { ops.push({ op: 'add', col: 'fristen', data: Object.assign({ titel, datum, status: 'offen', angelegt: tag, quelle: 'leben' }, extra) }); hinweise.push('Aufgabe zum ' + fmt(datum) + ': ' + titel); };
  for (const a of def.aufgaben) neu(def.name + ': ' + a, dingId ? { dingId } : {});
  if (def.rolle) for (const v of S.vertraege.filter((v: any) => rollenVon(v).includes(def.rolle) && laeuft(v))) neu(def.name + ': Vertrag „' + v.kurzname + '“ prüfen', { vertragId: v.id });
  const ev: any = { datum, typ: 'leben', text: def.name }; if (dingId) ev.dingId = dingId;
  ops.push({ op: 'add', col: 'ereignisse', data: ev });
  return { ops, hinweise };
}
/* Kündigungsentwurf: Vorlage mit {Anbieter}, {Datum}, {Vertrag}, {Vertragsende}; [Name] usw. ersetzt man selbst. */
const KUEND_STD = '[Name]\n[Adresse]\n\n{Anbieter}\n\n{Datum}\n\nKündigung: {Vertrag}, Kundennummer [Kundennummer]\n\nSehr geehrte Damen und Herren,\n\nhiermit kündige ich den oben genannten Vertrag ordentlich zum {Vertragsende}.\n\n' +
  'Bitte bestätigen Sie mir die Kündigung und das Datum des Vertragsendes in Textform.\n\nMit freundlichen Grüßen\n[Name]';
function kuendigungsText(v: any, firma: any, tag: any, vorlage: any) {
  const kj = kuendigungJetzt(v, tag), zum = kj && kj.art === 'termin' ? kj.zum : kj ? null : v.laufzeitende;
  const w: any = { Anbieter: firma ? firma.name : '[Anbieter]', Datum: fmt(tag), Vertrag: v.kurzname, Vertragsende: zum ? fmt(zum) + ', hilfsweise zum nächstmöglichen Termin' : 'nächstmöglichen Termin' };
  return (typeof vorlage === 'string' && vorlage.trim() ? vorlage : KUEND_STD).replace(/\{(Anbieter|Datum|Vertrag|Vertragsende)\}/g, (m, k) => w[k]);
}
const SOFORT_STD = ['Schaden begrenzen: Wasser abstellen, Strom sichern, Gefahrenstelle absperren.', 'Fotos und Videos machen, bevor etwas verändert oder weggeworfen wird.', 'Unverzüglich beim Versicherer melden (Hotline unten). Bei Einbruch, Diebstahl oder Unfall auch bei der Polizei.', 'Beschädigte Sachen und Belege aufbewahren, Reparaturen erst nach Rücksprache.'];
const sofortListe = (einst: any) => { const l = einst && einst.texte && einst.texte.sofort; return Array.isArray(l) && l.length ? l : SOFORT_STD; };

/* ---------- Fragen und Schadenfall (Stufe d) ---------- */
/* War der Vertrag an diesem Tag in Kraft? Angebote nie; beendete nur bis zu ihrem Ende. */
function aktivAm(v: any, fassungen: any, tag: any) {
  if (v.status === 'angebot') return false;
  const erste = (fassungen || []).filter((f: any) => f.vertragId === v.id).map((f: any) => f.gueltigVon).sort()[0];
  const start = v.beginn || v.abschluss || erste || v.angelegt;
  if (start && start > tag && (v.beginn || v.abschluss)) return false;
  if (v.status === 'aktiv') return true;
  const ende = v.gekuendigtZum || v.laufzeitende || v.erstlaufzeitEnde;
  return !ende || tag <= ende;
}
/* Was Claude für eine Frage sehen darf: Stand am Stichtag, Steckbriefe nur von Verträgen, die dann in Kraft waren. */
function akteKontext(S: any, tag: any, heuteTag: any) {
  const firma = (id: any) => (S.firmen.find((f: any) => f.id === id) || {}), ding = (id: any) => (S.dinge.find((d: any) => d.id === id) || {});
  const inKraft = [], nicht = [];
  for (const v of S.vertraege) {
    if (aktivAm(v, S.fassungen, tag)) {
      const st = standAm(v, S.fassungen, tag), sb = steckbriefAm(v.id, S.dokumente, tag), kj = st.status === 'aktiv' ? kuendigungJetzt(st, tag) : null, kb = kj && kj.art === 'termin' ? kj.bis : null;
      const o: any = { vertrag: v.kurzname, art: v.art, firma: firma(v.firmaId).name, hotline: firma(v.firmaId).hotline, fuerWen: rollenVon(v).join(', ') || undefined, bezug: dingeVon(v).map(id => ding(id).name).filter(Boolean).join(', ') || undefined,
        statusHeute: v.status, beitragProMonat: st.beitrag ? Math.round(proMonat(st) * 100) / 100 : undefined, laufzeitende: st.laufzeitende, kuendigenBis: kb || undefined, kuendigung: kj ? kj.text : undefined, gekuendigtZum: v.gekuendigtZum };
      if (sb) o.steckbrief = Object.assign({ dokumentId: sb.id, dokument: sb.titel, gueltigVon: sb.gueltigVon || sb.datum, gueltigBis: sb.gueltigBis }, sb.steckbrief);
      else if (istVers(v)) o.steckbrief = null;
      inKraft.push(JSON.parse(JSON.stringify(o)));
    } else nicht.push({ vertrag: v.kurzname, art: v.art, status: v.status, ende: v.gekuendigtZum || v.laufzeitende, beginn: v.beginn || v.abschluss });
  }
  return {
    stichtag: tag, heute: heuteTag, inKraft, nichtInKraft: nicht,
    dinge: S.dinge.map((d: any) => ({ name: d.name, bereich: d.kategorie, hersteller: d.hersteller, modell: d.modell, jahr: d.jahr, status: d.status })),
    belege: S.belege.slice().sort((a: any, b: any) => (a.datum || '') < (b.datum || '') ? 1 : -1).slice(0, 80).map((b: any) => ({ wofuer: b.titel, datum: b.datum, firma: firma(b.firmaId).name, ding: ding(b.dingId).name, betrag: b.betrag, arbeitskosten: b.arbeitskosten, steuer: b.steuer, unbar: !!b.unbar, gewaehrleistungBis: gewBis(b) || undefined })),
    termine: alleFristen(S, heuteTag).filter(f => !f.erledigt).map(f => ({ titel: f.titel, datum: f.datum })),
    fixkosten: fixkosten(S.vertraege, S.fassungen, tag),
  };
}
/* Verzeichnis aller Dokumente für Schritt 1 (ohne Seitentext). */
function dokVerzeichnis(S: any) {
  return S.dokumente.map((d: any) => { const v = S.vertraege.find((x: any) => x.id === d.vertragId) || {};
    return JSON.parse(JSON.stringify({ dokumentId: d.id, typ: d.typ, titel: d.titel, datum: d.datum, gueltigVon: d.gueltigVon, gueltigBis: d.gueltigBis, vertrag: v.kurzname, vertragStatus: v.status, seiten: d.seiten, fundstellen: d.steckbrief ? d.steckbrief.fundstellen : undefined })); });
}
/* Antwort aus Schritt 1 prüfen: nur vorhandene Dokumente und Seiten, höchstens 12 Seiten. */
function seitenWunsch(roh: any, S: any, heuteTag: any) {
  roh = roh && typeof roh === 'object' ? roh : {};
  const tag = typeof roh.stichtag === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(roh.stichtag) ? roh.stichtag : heuteTag, out = []; let n = 0;
  for (const w of Array.isArray(roh.seiten) ? roh.seiten : []) {
    const d = S.dokumente.find((x: any) => x.id === (w && w.dokumentId)); if (!d) continue;
    const nr = Array.from(new Set((Array.isArray(w.seiten) ? w.seiten : []).map(Number).filter((x: any) => Number.isInteger(x) && x >= 1 && x <= (d.seiten || 1)))).sort((a: any, b: any) => a - b).slice(0, 12 - n);
    if (nr.length) { out.push({ dokumentId: d.id, titel: d.titel || d.typ, seiten: nr }); n += nr.length; }
    if (n >= 12) break;
  }
  return { stichtag: tag, seiten: out };
}
/* Policen für einen Schadentag: jede Versicherung, die an dem Tag in Kraft war, mit der damals gültigen Fassung. */
function schadenPolicen(S: any, tag: any) {
  return S.vertraege.filter((v: any) => istVers(v) && aktivAm(v, S.fassungen, tag)).map((v: any) => {
    const sb = steckbriefAm(v.id, S.dokumente, tag), f = fassungAm(v, S.fassungen, tag), fa = S.firmen.find((x: any) => x.id === v.firmaId) || {};
    return { vertragId: v.id, kurzname: v.kurzname, firma: fa.name || null, hotline: fa.hotline || fa.telefon || null, statusHeute: v.status,
      fassungVon: f ? f.gueltigVon : null, dokumentId: sb ? sb.id : null, dokument: sb ? (sb.titel || sb.typ) : null, steckbriefVon: sb ? (sb.gueltigVon || sb.datum || null) : null, steckbrief: sb ? sb.steckbrief : null };
  });
}
/* KI-Ergebnis je Police absichern: jede Police bekommt genau einen Eintrag; "nein" nur mit Fundstelle oder Ausschluss, sonst "unklar". */
function schadenErgebnis(policen: any, roh: any) {
  const liste = roh && Array.isArray(roh.policen) ? roh.policen : [];
  const arr = (v: any) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [];
  return policen.map((p: any) => {
    const base = { vertragId: p.vertragId, kurzname: p.kurzname, firma: p.firma, hotline: p.hotline, fassungVon: p.fassungVon, dokumentId: p.dokumentId, dokument: p.dokument, steckbriefVon: p.steckbriefVon };
    if (!p.steckbrief) return Object.assign(base, { greift: 'unklar', begruendung: 'Zu dieser Police ist für den Schadentag kein Steckbrief gespeichert. Police hochladen oder Bedingungen selbst prüfen.', fundstellen: [], ausschluesse: [], selbstbeteiligung: null, pflichten: [], fristen: [], offeneFragen: [] });
    const r = liste.find((x: any) => x && x.vertragId === p.vertragId);
    if (!r) return Object.assign(base, { greift: 'unklar', begruendung: 'Für diese Police kam keine Einschätzung zurück.', fundstellen: [], ausschluesse: [], selbstbeteiligung: null, pflichten: [], fristen: [], offeneFragen: [] });
    const fund = (Array.isArray(r.fundstellen) ? r.fundstellen : []).filter((f: any) => f && (f.seite || f.klausel)).map((f: any) => ({ seite: Number(f.seite) || null, klausel: typeof f.klausel === 'string' ? f.klausel : null }));
    let greift = ['ja', 'nein', 'unklar'].includes(r.greift) ? r.greift : 'unklar', beg = typeof r.begruendung === 'string' ? r.begruendung : '';
    const aus = arr(r.ausschluesse);
    if (greift === 'nein' && !fund.length && !aus.length && r.andereSparte !== true) { greift = 'unklar'; beg = (beg ? beg + ' ' : '') + '(Ohne Fundstelle gilt: nicht gefunden heißt unklar, nicht „nicht versichert“.)'; }
    return Object.assign(base, { greift, begruendung: beg, fundstellen: fund, ausschluesse: aus, selbstbeteiligung: typeof r.selbstbeteiligung === 'string' && r.selbstbeteiligung.trim() ? r.selbstbeteiligung : null, pflichten: arr(r.pflichten), fristen: arr(r.fristen), offeneFragen: arr(r.offeneFragen) });
  });
}

/* ---------- Kalender, Export, Sicherung (Stufe e) ---------- */
/* Bewusst geändert gegenüber dem Altbestand: „;“ wird als „\;“ maskiert (RFC 5545); vorher blieb es unmaskiert. */
const icsEsc = (t: any) => String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFalten = (z: any) => { const out: any[] = []; let r = z; while (r.length > 73) { out.push(r.slice(0, 73)); r = ' ' + r.slice(73); } out.push(r); return out.join('\r\n'); };
/* Kalenderdatei: ganztägige Termine mit Alarm um 9 Uhr am Tag; Kündigungsfristen zusätzlich mit Vorwarnung. */
function icsText(liste: any, vorlauf: any, stempel: any) {
  const z = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Haushalts-App//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const alarm = (trigger: any, text: any) => z.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(text), 'TRIGGER:' + trigger, 'END:VALARM');
  for (const f of liste) {
    z.push('BEGIN:VEVENT', 'UID:haushalt-' + f.id + '-' + f.datum + '@haushalts-app', 'DTSTAMP:' + stempel, 'DTSTART;VALUE=DATE:' + f.datum.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(f.datum, 1).replace(/-/g, ''),
      'SUMMARY:' + icsEsc(f.titel), 'DESCRIPTION:' + icsEsc((f.notiz ? f.notiz + '\n' : '') + 'Aus der Haushalts-App.'), 'TRANSP:TRANSPARENT');
    alarm('PT9H', f.titel);
    if (/^(kb_|best_)/.test(f.id) || /kündig/i.test(f.titel)) alarm('-PT' + (vorlauf * 24 - 9) + 'H', 'In ' + vorlauf + ' Tagen: ' + f.titel);
    z.push('END:VEVENT');
  }
  z.push('END:VCALENDAR');
  return z.map(icsFalten).join('\r\n') + '\r\n';
}
/* Kalender-Abgleich: was neu einzutragen und was im Kalender zu löschen ist. */
function kalenderListe(S: any, tag: any) {
  const alle = alleFristen(S, tag), doc = (id: any) => S.fristen.find((d: any) => d.id === id), neu: any[] = [], loeschen: any[] = [], eingetragen: any[] = [];
  for (const f of alle) {
    const d = doc(f.id) || {};
    if (!f.erledigt && f.datum && f.datum >= tag) (d.kalDatum === f.datum ? eingetragen : neu).push(f);
  }
  for (const d of S.fristen) {
    const f = alle.find(x => x.id === d.id), titel = d.kalTitel || d.titel || (f && f.titel) || 'Termin';
    for (const alt of d.kalAlt || []) if (alt >= tag) loeschen.push({ id: d.id, titel, datum: alt, grund: 'Datum hat sich geändert' });
    if (d.kalDatum && d.kalDatum >= tag && (!f || f.erledigt || f.datum !== d.kalDatum)) loeschen.push({ id: d.id, titel, datum: d.kalDatum, grund: !f ? 'Frist gibt es nicht mehr' : f.erledigt ? 'erledigt' : 'Datum hat sich geändert' });
  }
  return { neu, loeschen, eingetragen };
}
/* Neuer Stand des Fristen-Datensatzes, nachdem die Kalenderdatei geladen bzw. der alte Termin gelöscht wurde. */
function kalMarkieren(doc: any, f: any) {
  const d = Object.assign(f.manuell ? {} : { abgeleitet: true }, doc); delete d.id;
  if (d.kalDatum && d.kalDatum !== f.datum) d.kalAlt = (d.kalAlt || []).concat([d.kalDatum]);
  d.kalDatum = f.datum; d.kalTitel = f.titel; return d;
}
function kalGeloescht(doc: any, datum: any) {
  const d = Object.assign({}, doc); delete d.id;
  if (d.kalAlt) { d.kalAlt = d.kalAlt.filter((x: any) => x !== datum); if (!d.kalAlt.length) delete d.kalAlt; }
  if (d.kalDatum === datum) delete d.kalDatum;
  return d;
}
/* Tabellen für den Excel-Export: eine je Bereich, IDs durch Namen ersetzt. */
function exportTabellen(S: any, tag: any) {
  const n = (col: any, id: any, k: any) => (S[col].find((x: any) => x.id === id) || ({} as any))[k] || '', ja = (b: any) => b ? 'ja' : '', jahr = tag.slice(0, 4);
  const jahre = Array.from(new Set([jahr].concat(S.belege.filter((b: any) => b.datum).map((b: any) => b.datum.slice(0, 4))))).sort();
  const liste = (a: any) => Array.isArray(a) ? a.map(x => typeof x === 'string' ? x : Object.values(x).filter(Boolean).join(' · ')).join('; ') : (a || '');
  return {
    'Verträge': S.vertraege.map((v: any) => { const st = standAm(v, S.fassungen, tag); return { Kurzname: v.kurzname, Art: v.art, Status: v.status, Firma: n('firmen', v.firmaId, 'name'), 'Für wen': rollenVon(v).join(', '), Bezug: dingeVon(v).map(id => n('dinge', id, 'name')).filter(Boolean).join(', '),
      Beitrag: st.beitrag || '', Zahlweise: st.zahlweise || '', '€/Monat': st.beitrag ? Math.round(proMonat(st) * 100) / 100 : '', Abschluss: v.abschluss || '', Beginn: v.beginn || '', Laufzeitende: st.laufzeitende || '',
      Kündigungsfrist: st.fristWert ? st.fristWert + ' ' + st.fristEinheit : '', 'Kündigen bis': (k => !k ? '' : k.art === 'termin' ? k.bis : k.art === 'jederzeit' ? 'jederzeit' + (k.zum ? ', Ende frühestens ' + k.zum : '') : 'unklar')(kuendigungJetzt(st, tag)), Verlängerung: v.verlaengerung || '', Kündigungsweg: v.kuendigungsweg || '',
      'Gekündigt am': v.gekuendigtAm || '', 'Gekündigt zum': v.gekuendigtZum || '', Bestätigt: ja(v.bestaetigt), 'Ersetzt durch': n('vertraege', v.ersetztDurchId, 'kurzname') }; }),
    'Fassungen': S.fassungen.map((f: any) => ({ Vertrag: n('vertraege', f.vertragId, 'kurzname'), 'Gültig von': f.gueltigVon, 'Gültig bis': f.gueltigBis || '', Grund: f.grund || '', Beitrag: f.beitrag || '', Zahlweise: f.zahlweise || '', Laufzeitende: f.laufzeitende || '', Kündigungsfrist: f.fristWert ? f.fristWert + ' ' + f.fristEinheit : '' })),
    'Firmen': S.firmen.map((f: any) => ({ Name: f.name, Art: f.art || '', Telefon: f.telefon || '', 'E-Mail': f.email || '', Hotline: f.hotline || '' })),
    'Dinge': S.dinge.map((d: any) => ({ Bezeichnung: d.name, Bereich: d.kategorie, Hersteller: d.hersteller || '', Modell: d.modell || '', 'Kauf-/Baujahr': d.jahr || '', Status: d.status || 'aktiv' })),
    'Belege': S.belege.map((b: any) => ({ Wofür: b.titel, Datum: b.datum || '', Firma: n('firmen', b.firmaId, 'name'), Ding: n('dinge', b.dingId, 'name'), Betrag: b.betrag || '', Arbeitskosten: b.arbeitskosten || '', Steuer: b.steuer || '-', Unbar: ja(b.unbar), 'Übergabe/Abnahme': b.uebergabe || '', 'Gewährleistung bis': gewBis(b) || '' })),
    '§35a': jahre.flatMap(j => { const s = steuer35a(S.belege, j); return Object.keys(s).map(a => ({ Steuerjahr: j, Art: a, Belege: s[a].anzahl, Arbeitskosten: s[a].arbeit, 'davon unbar': s[a].anrechenbar, '20 %': Math.round(s[a].ermaessigung * 100) / 100, Höchstbetrag: MAX35A[a] })); }),
    'Termine': alleFristen(S, tag).map(f => ({ Datum: f.datum || '', Titel: f.titel, Status: f.erledigt ? 'erledigt' : 'offen', Art: f.manuell ? 'manuell' : 'abgeleitet', Vertrag: n('vertraege', f.vertragId, 'kurzname'), Notiz: f.notiz || '', Kalender: (S.fristen.find((d: any) => d.id === f.id) || {}).kalDatum === f.datum ? 'eingetragen' : '' })),
    'Dokumente': S.dokumente.map((d: any) => { const sb = d.steckbrief || {}; return { Typ: d.typ, Titel: d.titel || '', Datum: d.datum || '', 'Gültig von': d.gueltigVon || '', 'Gültig bis': d.gueltigBis || '', Vertrag: n('vertraege', d.vertragId, 'kurzname'), Ding: n('dinge', d.dingId, 'name'), Firma: n('firmen', d.firmaId, 'name'), Seiten: d.seiten || '',
      Original: (d.dateien || []).length ? 'gespeichert' : 'nur Text', Versichert: liste(sb.gefahren), Summen: liste(sb.summen), Selbstbeteiligung: sb.selbstbeteiligung || '', Ausschlüsse: liste(sb.ausschluesse), Pflichten: liste(sb.pflichten), Meldefristen: liste(sb.meldefristen), Mitversichert: liste(sb.mitversichert), Fundstellen: liste(sb.fundstellen) }; }),
    'Schadenfälle': S.schadenfaelle.map((x: any) => ({ Schadentag: x.datum, Beschreibung: x.beschreibung, Status: x.status || 'offen', Betroffen: (x.dingIds || []).map((id: any) => n('dinge', id, 'name')).join(', '), 'Gemeldet am': x.gemeldetAm || '', 'Gemeldet bei': n('vertraege', x.gemeldetBei, 'kurzname'), 'Antwort am': x.antwortAm || '', Antwort: x.antwort || '', Prüfung: (x.pruefung || []).map((p: any) => p.kurzname + ': ' + p.greift).join('; ') })),
    'Zähler': (S.zaehler || []).flatMap((z: any) => ablesungen(z.staende).reverse().map((a: any) => ({ Zähler: z.name, Art: z.art || '', Einheit: z.einheit || '', Datum: a.datum, Stand: a.wert, 'Verbrauch seit letzter Ablesung': a.seit == null ? '' : a.seit, Tage: a.tage == null ? '' : a.tage }))),
    'Zeitleiste': S.ereignisse.slice().sort((a: any, b: any) => a.datum < b.datum ? -1 : 1).map((e: any) => ({ Datum: e.datum, Vertrag: n('vertraege', e.vertragId, 'kurzname'), Ding: n('dinge', e.dingId, 'name'), Ereignis: e.text })),
  };
}
const SICHER_COLS = ['firmen', 'dinge', 'vertraege', 'fassungen', 'dokumente', 'belege', 'fristen', 'ereignisse', 'schadenfaelle', 'zaehler'];
/* Vollständige Sicherung als ein Objekt; seiten = { dokumentId: [{id, nr, text}] }. */
function sicherung(S: any, seiten: any, tag: any) {
  const c: any = {}; for (const k of SICHER_COLS) c[k] = (S[k] || []).map((x: any) => JSON.parse(JSON.stringify(x)));
  return { app: 'haushalts-app', format: 1, erstellt: tag, einstellungen: S.einst, sammlungen: c, seiten };
}
/* Sicherung prüfen und in Schreib-Schritte übersetzen. Bestehendes wird überschrieben, nichts gelöscht. */
function importOps(b: any) {
  if (!b || b.app !== 'haushalts-app' || b.format !== 1 || !b.sammlungen) return { fehler: 'Das ist keine Sicherung der Haushalts-App.' };
  const ops: any[] = [], zahl: any = {};
  for (const k of SICHER_COLS) { const l = Array.isArray(b.sammlungen[k]) ? b.sammlungen[k].filter(x => x && typeof x.id === 'string') : []; zahl[k] = l.length;
    for (const x of l) { const d = Object.assign({}, x); delete d.id; ops.push({ op: 'set', pfad: k + '/' + x.id, data: d }); } }
  let s = 0; for (const id in b.seiten || {}) for (const p of b.seiten[id] || []) { ops.push({ op: 'set', pfad: 'dokumente/' + id + '/seiten/' + p.id, data: { nr: p.nr, text: p.text } }); s++; }
  zahl.seiten = s;
  if (b.einstellungen) ops.push({ op: 'set', pfad: 'einstellungen/haushalt', data: b.einstellungen });
  if (b.schwaerzlisteVerschluesselt && b.schwaerzlisteVerschluesselt.daten) ops.push({ op: 'set', pfad: 'einstellungen/schwaerzliste', data: b.schwaerzlisteVerschluesselt });
  return { ops, zahl };
}

/* ---------- Markdown je Dokument ---------- */
const mdEsc = (t: any) => String(t == null ? '' : t).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
function dokMarkdown(d: any, seiten: any, S: any) {
  const n = (col: any, id: any, k: any) => (S[col].find((x: any) => x.id === id) || ({} as any))[k], sb = d.steckbrief, z = ['# ' + (d.titel || d.typ), ''];
  const kopf = [['Typ', d.typ], ['Datum', d.datum && fmt(d.datum)], ['Gültig von', d.gueltigVon && fmt(d.gueltigVon)], ['Gültig bis', d.gueltigBis && fmt(d.gueltigBis)], ['Vertrag', n('vertraege', d.vertragId, 'kurzname')],
    ['Firma', n('firmen', d.firmaId, 'name')], ['Ding', n('dinge', d.dingId, 'name')], ['Seiten', d.seiten], ['Original in der App', (d.dateien || []).length ? 'gespeichert' : 'nicht gespeichert, nur Text']].filter(x => x[1] != null && x[1] !== '');
  z.push('| Feld | Wert |', '| --- | --- |', ...kopf.map(x => '| ' + x[0] + ' | ' + mdEsc(x[1]) + ' |'), '');
  if (sb) {
    z.push('## Steckbrief', '');
    const liste = (t: any, a: any) => { const l = (Array.isArray(a) ? a : []).filter(Boolean); if (l.length) z.push('### ' + t, '', ...l.map(x => '- ' + (typeof x === 'string' ? x : [x.was || x.thema, x.betrag, x.seite && 'S. ' + x.seite, x.klausel].filter(Boolean).join(' · '))), ''); };
    liste('Versichert', sb.gefahren); liste('Summen', sb.summen);
    if (sb.selbstbeteiligung) z.push('### Selbstbeteiligung', '', String(sb.selbstbeteiligung), '');
    liste('Ausschlüsse', sb.ausschluesse); liste('Pflichten', sb.pflichten); liste('Meldefristen', sb.meldefristen); liste('Mitversichert', sb.mitversichert); liste('Fundstellen', sb.fundstellen);
  }
  z.push('## Text', '');
  for (const p of (seiten || []).slice().sort((a: any, b: any) => a.nr - b.nr)) z.push('### Seite ' + p.nr, '', (p.text || '(kein Text erkannt)').trim(), '');
  if (!(seiten || []).length) z.push('(kein Text gespeichert)', '');
  z.push('---', 'Geschwärzter Text aus der Haushalts-App. Namen, Anschrift und Nummern sind ersetzt, soweit erkannt.', '');
  return z.join('\n');
}
/* Eindeutige, lesbare Dateinamen: Datum-Typ-Titel.md */
function mdNamen(dokumente: any) {
  const belegt: any = {}, out: any = {};
  for (const d of dokumente) {
    let b = [d.datum || d.gueltigVon || 'ohne-Datum', d.typ, d.titel].filter(Boolean).join(' ').replace(/[^\wäöüÄÖÜß\- ]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 70) || 'Dokument';
    if (belegt[b]) b += '-' + (++belegt[b]); else belegt[b] = 1;
    out[d.id] = b + '.md';
  }
  return out;
}

/* ---------- Eigene Auswahlwerte, eigene Lebensereignisse, wiederkehrende Termine ---------- */
ENUM.dingKat = ['Haus', 'Auto', 'Gerät', 'Wertsache'];
const BASIS: Record<string, string[]> = { typ: ENUM.typ.slice(), firmaArt: ENUM.firmaArt.slice(), vertragArt: ENUM.vertragArt.slice(), rolle: ENUM.rolle.slice(), dingKat: ENUM.dingKat.slice() };
const EIGEN_LISTEN = { firmaArt: 'Art der Firma', dingKat: 'Bereich für Dinge', vertragArt: 'Art des Vertrags', rolle: 'Rolle (Für wen)', typ: 'Dokumenttyp' };
/* Eigene Werte aus den Einstellungen an die festen Listen anhängen. */
function setEigene(e: any) {
  e = e || {};
  for (const k in BASIS) ENUM[k] = BASIS[k].concat((Array.isArray(e[k]) ? e[k] : []).filter(x => typeof x === 'string' && x.trim() && !BASIS[k].includes(x)));
}
/* Neuen eigenen Wert in die Einstellungen aufnehmen (ohne Doppelte). Gibt die neuen Einstellungen zurück oder null, wenn nichts zu tun ist. */
function mitEigenem(einst: any, liste: any, wert: any) {
  wert = String(wert || '').trim();
  const e = Object.assign({}, einst.eigene), alt = Array.isArray(e[liste]) ? e[liste] : [];
  if (!wert || !BASIS[liste] || BASIS[liste].concat(alt).some((x: any) => x.toLowerCase() === wert.toLowerCase())) return null;
  e[liste] = alt.concat([wert]);
  return Object.assign({}, einst, { eigene: e });
}
/* Alle auswählbaren Lebensereignisse: eingebaute (außer ausgeblendete) plus eigene. */
function lebenListe(einst: any) {
  const l = (einst && einst.leben) || {}, weg = l.versteckt || [];
  return Object.keys(LEBEN).filter(k => !weg.includes(k)).map(k => Object.assign({ key: k, eigen: false, auto: k === 'autoverkauf' }, LEBEN[k]))
    .concat((l.eigene || []).map((x: any) => ({ key: x.id, eigen: true, auto: false, name: x.name, rolle: x.rolle || undefined, aufgaben: x.aufgaben || [] })));
}
/* Wiederkehrender Termin: Datensatz für den nächsten Termin, oder null. */
function naechsterTermin(doc: any) {
  const n = Number(doc.wiederholung);
  if (!n || !doc.datum) return null;
  const d = Object.assign({}, doc); delete d.id; delete d.kalDatum; delete d.kalAlt; delete d.kalTitel;
  d.datum = addMonths(doc.datum, n); d.status = 'offen';
  return d;
}

/* ---------- Suche, Deckung, Notfallblatt, Vergleich, Zähler, Jahres-Check ---------- */
const klein = (t: any) => String(t == null ? '' : t).toLowerCase();
const SUCH_NAMEN: Record<string, string> = { vertraege: 'Vertrag', firmen: 'Firma', dinge: 'Ding', belege: 'Beleg', fristen: 'Termin', dokumente: 'Dokument', schadenfaelle: 'Schadenfall', zaehler: 'Zähler' };
/* Suche in allen Einträgen: jedes Wort der Eingabe muss vorkommen (auch in verknüpften Namen). */
function suche(S: any, q: any) {
  const worte = klein(q).split(/\s+/).filter(w => w.length >= 2), out: any[] = [];
  if (!worte.length) return out;
  const name = (col: any, id: any) => { const x = (S[col] || []).find((r: any) => r.id === id); return x ? (x.name || x.kurzname || x.titel || '') : ''; };
  for (const col of Object.keys(SUCH_NAMEN)) for (const r of S[col] || []) {
    if (r.abgeleitet) continue;
    const teile = []; (function sammle(v) { if (typeof v === 'string' || typeof v === 'number') teile.push(String(v)); else if (Array.isArray(v)) v.forEach(sammle); else if (v && typeof v === 'object') Object.keys(v).forEach(k => { if (!/Id$|Ids$|^id$|^dateien$|^pruefung$/.test(k)) sammle(v[k]); }); })(r);
    teile.push(name('firmen', r.firmaId), name('vertraege', r.vertragId), name('dinge', r.dingId), dingeVon(r).map(id => name('dinge', id)).join(' '));
    const text = klein(teile.join(' · '));
    if (worte.every(w => text.includes(w))) out.push({ col, id: r.id, art: SUCH_NAMEN[col], titel: r.name || r.kurzname || r.titel || SUCH_NAMEN[col], zusatz: [r.art || r.typ || r.kategorie, r.datum && fmt(r.datum), r.status && r.status !== 'aktiv' && r.status !== 'offen' ? r.status : null].filter(Boolean).join(' · ') });
  }
  return out;
}
/* Suche in gespeicherten Dokumenttexten: seiten = { dokumentId: [{nr, text}] }. Gibt Treffer mit Textausschnitt zurück. */
function sucheText(S: any, seiten: any, q: any) {
  const worte = klein(q).split(/\s+/).filter(w => w.length >= 2), out: any[] = [];
  if (!worte.length) return out;
  for (const d of S.dokumente) for (const p of (seiten[d.id] || []).slice().sort((a: any, b: any) => a.nr - b.nr)) {
    const t = String(p.text || ''), k = klein(t);
    if (!worte.every(w => k.includes(w))) continue;
    const i = k.indexOf(worte[0]), von = Math.max(0, i - 60);
    out.push({ col: 'dokumente', id: d.id, titel: d.titel || d.typ, seite: p.nr, ausschnitt: (von ? '… ' : '') + t.slice(von, i + 120).replace(/\s+/g, ' ').trim() + (i + 120 < t.length ? ' …' : '') });
  }
  return out;
}
/* Deckungsübersicht: jede laufende Versicherung mit dem heute gültigen Steckbrief. */
function deckung(S: any, tag: any) {
  const firma = (id: any) => (S.firmen.find((f: any) => f.id === id) || {});
  return S.vertraege.filter((v: any) => istVers(v) && laeuft(v)).map((v: any) => {
    const d = steckbriefAm(v.id, S.dokumente, tag), sb = d ? d.steckbrief : null, arr = (a: any) => Array.isArray(a) ? a.filter(Boolean) : [];
    return { vertragId: v.id, kurzname: v.kurzname, firma: firma(v.firmaId).name || null, hotline: firma(v.firmaId).hotline || null, status: v.status, endet: v.status === 'gekuendigt' ? (v.gekuendigtZum || v.laufzeitende || null) : null,
      fuerWen: rollenVon(v), bezug: dingeVon(v).map(id => (S.dinge.find((x: any) => x.id === id) || {}).name).filter(Boolean), dokumentId: d ? d.id : null, dokument: d ? (d.titel || d.typ) : null,
      hatSteckbrief: !!sb, gefahren: sb ? arr(sb.gefahren) : [], summen: sb ? arr(sb.summen) : [], selbstbeteiligung: sb && sb.selbstbeteiligung ? String(sb.selbstbeteiligung) : null, ausschluesse: sb ? arr(sb.ausschluesse) : [], mitversichert: sb ? arr(sb.mitversichert) : [] };
  }).sort((a: any, b: any) => a.kurzname.localeCompare(b.kurzname, 'de'));
}
/* Notfallblatt: Hotlines und laufende Verträge, ohne Beträge, Namen und Nummern. */
function notfallDaten(S: any, einst: any, tag: any) {
  const firma = (id: any) => (S.firmen.find((f: any) => f.id === id) || {}), lfd = S.vertraege.filter(laeuft);
  const zeile = (v: any) => ({ name: v.kurzname, firma: firma(v.firmaId).name || '', hotline: firma(v.firmaId).hotline || firma(v.firmaId).telefon || '', fuerWen: rollenVon(v).join(', '), bezug: dingeVon(v).map(id => (S.dinge.find((x: any) => x.id === id) || {}).name).filter(Boolean).join(', ') });
  const inVertraegen = new Set(lfd.map((v: any) => v.firmaId));
  return { stand: tag, sofort: sofortListe(einst), versicherungen: lfd.filter(istVers).map(zeile).sort((a: any, b: any) => a.name.localeCompare(b.name, 'de')), vertraege: lfd.filter((v: any) => !istVers(v)).map(zeile).filter((z: any) => z.hotline).sort((a: any, b: any) => a.name.localeCompare(b.name, 'de')),
    firmen: S.firmen.filter((f: any) => !inVertraegen.has(f.id) && (f.hotline || f.telefon)).map((f: any) => ({ name: f.name, art: f.art || '', hotline: f.hotline || f.telefon })).sort((a: any, b: any) => a.name.localeCompare(b.name, 'de')) };
}
/* Angebot neben Vertrag: Zeilen zum Gegenüberstellen, ohne Wertung. */
function vergleich(a: any, b: any, S: any, tag: any) {
  const seite = (v: any) => { const st = standAm(v, S.fassungen, tag), d = steckbriefAm(v.id, S.dokumente, tag) || S.dokumente.filter((x: any) => x.vertragId === v.id && x.steckbrief).sort((x: any, y: any) => (x.datum || '') < (y.datum || '') ? 1 : -1)[0], sb = (d && d.steckbrief) || {};
    return { st, sb, hat: !!(d && d.steckbrief), firma: (S.firmen.find((f: any) => f.id === v.firmaId) || {}).name || '–' }; };
  const A = seite(a), B = seite(b), txt = (x: any) => x == null || x === '' ? '–' : String(x), arr = (x: any) => Array.isArray(x) ? x.filter(Boolean).map(y => typeof y === 'string' ? y : [y.was || y.thema, y.betrag].filter(Boolean).join(': ')) : [];
  const zeile = (label: any, x: any, y: any) => ({ label, a: txt(x), b: txt(y), gleich: txt(x) === txt(y) });
  const ende = (st: any) => st.laufzeitende ? fmt(st.laufzeitende) : 'unbefristet oder offen', frist = (st: any) => st.fristWert ? st.fristWert + ' ' + (Number(st.fristWert) === 1 ? st.fristEinheit.replace(/e$/, '').replace('Wochen', 'Woche') : st.fristEinheit) : null;
  const zeilen = [zeile('Status', a.status, b.status), zeile('Firma', A.firma, B.firma), zeile('Beitrag je Monat', A.st.beitrag ? eurT(proMonat(A.st)) : null, B.st.beitrag ? eurT(proMonat(B.st)) : null), zeile('Beitrag je Jahr', A.st.beitrag ? eurT(proMonat(A.st) * 12) : null, B.st.beitrag ? eurT(proMonat(B.st) * 12) : null),
    zeile('Laufzeit bis', ende(A.st), ende(B.st)), zeile('Kündigungsfrist', frist(A.st), frist(B.st)), zeile('Selbstbeteiligung', A.sb.selbstbeteiligung, B.sb.selbstbeteiligung)];
  const listen = [['Versichert', 'gefahren'], ['Summen', 'summen'], ['Ausschlüsse', 'ausschluesse'], ['Mitversichert', 'mitversichert']].map(([label, k]) => { const x = arr(A.sb[k]), y = arr(B.sb[k]), kx = x.map(klein), ky = y.map(klein);
    return { label, beide: x.filter(e => ky.includes(klein(e))), nurA: x.filter(e => !ky.includes(klein(e))), nurB: y.filter(e => !kx.includes(klein(e))) }; });
  const diff = A.st.beitrag && B.st.beitrag ? (proMonat(B.st) - proMonat(A.st)) * 12 : null;
  return { zeilen, listen, steckbriefA: A.hat, steckbriefB: B.hat, differenzJahr: diff };
}
/* Zählerstände: Stand an einem Tag (zwischen zwei Ablesungen linear geschätzt), Verbrauch im Zeitraum und je Jahr. */
const sortStaende = (st: any) => (st || []).filter((x: any) => x && x.datum && typeof x.wert === 'number').slice().sort((a: any, b: any) => a.datum < b.datum ? -1 : 1);
function standAmTag(staende: any, tag: any) {
  const s = sortStaende(staende); if (!s.length || tag < s[0].datum || tag > s[s.length - 1].datum) return null;
  const genau = s.filter((x: any) => x.datum === tag).pop(); if (genau) return { wert: genau.wert, geschaetzt: false };
  const i = s.findIndex((x: any) => x.datum > tag), a = s[i - 1], b = s[i];
  return { wert: a.wert + (b.wert - a.wert) * diffDays(a.datum, tag) / diffDays(a.datum, b.datum), geschaetzt: true };
}
function verbrauch(staende: any, von: any, bis: any) {
  const a = standAmTag(staende, von), b = standAmTag(staende, bis);
  if (!a || !b || bis <= von) return null;
  return { menge: Math.round((b.wert - a.wert) * 100) / 100, tage: diffDays(von, bis), geschaetzt: a.geschaetzt || b.geschaetzt };
}
function verbrauchJeJahr(staende: any) {
  const s = sortStaende(staende), out: any[] = []; if (s.length < 2) return out;
  for (let j = Number(s[0].datum.slice(0, 4)); j <= Number(s[s.length - 1].datum.slice(0, 4)); j++) {
    const von = j + '-01-01' < s[0].datum ? s[0].datum : j + '-01-01', bis = (j + 1) + '-01-01' > s[s.length - 1].datum ? s[s.length - 1].datum : (j + 1) + '-01-01', v = verbrauch(s, von, bis);
    if (v) out.push({ jahr: j, menge: v.menge, tage: v.tage, ganz: von === j + '-01-01' && bis === (j + 1) + '-01-01', geschaetzt: v.geschaetzt });
  }
  return out;
}
/* Ablesungen mit Verbrauch seit der vorherigen; fallender Stand (Zählerwechsel) wird markiert. */
function ablesungen(staende: any) {
  const s = sortStaende(staende);
  return s.map((x: any, i: any) => { const p = s[i - 1], d = p ? x.wert - p.wert : null, t = p ? diffDays(p.datum, x.datum) : null;
    return { datum: x.datum, wert: x.wert, seit: d == null ? null : Math.round(d * 100) / 100, tage: t, jeTag: d != null && (t as number) > 0 && d >= 0 ? Math.round(d / (t as number) * 100) / 100 : null, wechsel: d != null && d < 0 }; }).reverse();
}
/* Jahres-Check: was in der Akte fehlt oder auffällt. */
function jahresBefunde(S: any, tag: any) {
  const out: any[] = [], neu = (art: any, text: any, col: any, id: any) => out.push({ art, text, col, id }), lfd = S.vertraege.filter(laeuft);
  for (const v of lfd) {
    if (!v.firmaId) neu('Vertrag ohne Firma', v.kurzname, 'vertraege', v.id);
    if (!v.beitrag) neu('Vertrag ohne Beitrag', v.kurzname, 'vertraege', v.id);
    if (v.status === 'aktiv' && !v.laufzeitende && !jederzeit(v)) neu('Vertrag ohne Laufzeitende', v.kurzname + ': Laufzeitende eintragen oder Verlängerung auf „unbefristet“ stellen', 'vertraege', v.id);
    if (v.status === 'aktiv' && v.laufzeitende && !v.fristWert) neu('Vertrag ohne Kündigungsfrist', v.kurzname, 'vertraege', v.id);
    if (istVers(v) && !steckbriefAm(v.id, S.dokumente, tag)) neu('Versicherung ohne Steckbrief', v.kurzname + ': Police hochladen', 'vertraege', v.id);
    const fo = fortschreiben(v, tag); if (fo && fo.pruefen) neu('Frist verstrichen, Verlängerung unklar', v.kurzname + ': ' + fo.text, 'vertraege', v.id);
    if (v.status === 'gekuendigt' && !v.bestaetigt) neu('Kündigung ohne Bestätigung', v.kurzname, 'vertraege', v.id);
  }
  for (const v of S.vertraege.filter((v: any) => v.status === 'angebot' && (v.angelegt || tag) < addMonths(tag, -3))) neu('Angebot älter als 3 Monate', v.kurzname + ': annehmen oder verwerfen', 'vertraege', v.id);
  for (const f of S.firmen.filter((f: any) => !f.hotline && !f.telefon && lfd.some((v: any) => v.firmaId === f.id))) neu('Firma ohne Telefon oder Hotline', f.name, 'firmen', f.id);
  for (const d of S.dokumente.filter((d: any) => !d.vertragId && !d.dingId && !d.firmaId)) neu('Dokument ohne Zuordnung', d.titel || d.typ, 'dokumente', d.id);
  for (const b of S.belege) {
    if (!b.dingId && !b.firmaId) neu('Beleg ohne Zuordnung', b.titel, 'belege', b.id);
    if (b.steuer && b.steuer !== '-' && (!b.unbar || !b.arbeitskosten)) neu('§ 35a-Beleg unvollständig', b.titel + ': ' + (!b.arbeitskosten ? 'Arbeitskosten fehlen' : 'nicht als unbar bezahlt markiert'), 'belege', b.id);
  }
  for (const d of S.dinge.filter((d: any) => (d.status || 'aktiv') !== 'aktiv')) for (const v of lfd.filter((v: any) => dingeVon(v).includes(d.id))) neu('Vertrag an ' + (d.status === 'verkauft' ? 'verkauftem' : 'ersetztem') + ' Ding', v.kurzname + ' hängt an ' + d.name, 'vertraege', v.id);
  return out;
}
/* Fortschritt des Jahres-Checks: welche laufenden Verträge in diesem Jahr schon angesehen wurden. */
function jahresStand(S: any, einst: any, jahr: any) {
  const ges = ((einst && einst.jahrescheck) || {})[jahr] || {}, lfd = S.vertraege.filter(laeuft).sort((a: any, b: any) => a.kurzname.localeCompare(b.kurzname, 'de'));
  return { gesamt: lfd.length, erledigt: lfd.filter((v: any) => ges[v.id]).length, liste: lfd.map((v: any) => ({ id: v.id, kurzname: v.kurzname, art: v.art, angesehen: ges[v.id] || null })) };
}
/* Webadresse säubern: nur http(s), fehlendes https:// ergänzen; sonst null. */
function webAdresse(t: any) {
  t = String(t || '').trim(); if (!t) return null;
  if (!/^[a-z][a-z0-9+.\-]*:/i.test(t)) t = 'https://' + t;
  return /^https?:\/\/[^\s/?#]+\.[^\s]+$/i.test(t) && !/[<>"']/.test(t) ? t : null;
}

/* Text so kürzen, dass er als Datenbank-Eintrag sicher unter 256 KiB bleibt (Umlaute zählen doppelt). */
function kuerzeAufBytes(t: any, maxBytes: any) {
  t = String(t == null ? '' : t);
  const enc = new TextEncoder(), dec = new TextDecoder();
  if (enc.encode(t).length <= maxBytes) return t;
  const roh = enc.encode(t).slice(0, maxBytes);
  return dec.decode(roh).replace(/�$/, '') + '\n[…] Der Seitentext war zu lang und wurde hier abgeschnitten.';
}

export { kuendigungJetzt, fristEnde, kuerzeAufBytes, suche, sucheText, deckung, notfallDaten, vergleich, standAmTag, verbrauch, verbrauchJeJahr, ablesungen, jahresBefunde, jahresStand, webAdresse, istVers, dingeVon, rollenVon, KUEND_STD, SOFORT_STD, sofortListe, setEigene, mitEigenem, lebenListe, naechsterTermin, EIGEN_LISTEN, BASIS, dokMarkdown, mdNamen, icsText, kalenderListe, kalMarkieren, kalGeloescht, exportTabellen, sicherung, importOps, SICHER_COLS, aktivAm, akteKontext, dokVerzeichnis, seitenWunsch, schadenPolicen, schadenErgebnis, FKEYS, fassungAm, standAm, steckbriefAm, fassungOps, lueckePruefung, ereignisFolgen, wartung, dingFolgen, lebensFolgen, LEBEN, kuendigungsText, istKfz, tief, bereinigen, stapel, ENUM, toIso, addDays, addMonths, fmt, diffDays, heute, kuendigenBis, rechenweg, proMonat, laeuft, fixkosten, jederzeit, fortschreiben, gewBis, steuer35a, alleFristen, wichtig, MAX35A };

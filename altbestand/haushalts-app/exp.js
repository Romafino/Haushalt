/* Haushalts-App, Stufe (e): Kalenderdateien, Excel-Export, Datensicherung und Import. */
(function () {
  'use strict';
  const HA = window.HA, { h, $, S, L } = HA;
  const geladen = {};
  const lade = (src, name) => geladen[src] || (geladen[src] = new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok(window[name]); s.onerror = () => { delete geladen[src]; no({ code: 'bibliothek' }); }; document.head.append(s); }));
  async function speichern(filename, data) {
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (!dl) throw { code: 'unavailable' };
    return dl.save({ filename, data });
  }
  const dlFehler = e => ({ declined: 'Download abgebrochen. Es wurde nichts gespeichert.', unavailable: 'Downloads sind in dieser Ansicht nicht verfügbar. Öffne die App direkt in Claude.', rate_limited: 'Es ist noch eine Download-Nachfrage offen. Bitte kurz warten und noch einmal versuchen.',
    too_large: 'Die Datei ist zu groß. Versuche die Sicherung ohne Originaldateien.', bibliothek: 'Ein Baustein der App konnte nicht geladen werden. Bitte die App neu laden.' })[e && e.code] || 'Das hat nicht geklappt (' + (e && (e.code || e.message) || 'Fehler') + ').';
  HA.speichern = speichern; HA.dlFehler = dlFehler;
  const stempel = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const zip = async dateien => { const JSZip = await lade('jszip.min.js', 'JSZip'), z = new JSZip(); for (const d of dateien) z.file(d.name, d.data); return z.generateAsync({ type: 'blob', compression: 'DEFLATE' }); };
  const dateiName = t => t.replace(/[^\wäöüÄÖÜß\- ]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 50) || 'Termin';

  /* ---------- Kalender ---------- */
  HA.kalenderZahl = () => { const k = L.kalenderListe(S, L.heute()); return { neu: k.neu.length, loeschen: k.loeschen.length }; };
  async function kalLaden(liste, knopf) {
    knopf.disabled = true;
    try {
      const ics = L.icsText(liste, S.einst.vorlauf, stempel());
      const name = liste.length === 1 ? dateiName(liste[0].titel) + '-' + liste[0].datum : 'Haushalt-Termine-' + L.heute();
      await speichern(name + '.zip', await zip([{ name: name + '.ics', data: ics }]));
      for (const f of liste) await HA.db().doc('fristen/' + f.id).set(L.kalMarkieren(HA.byId('fristen', f.id), f));
      HA.toast(liste.length === 1 ? 'Geladen. Datei öffnen, um den Termin einzutragen.' : 'Geladen. Datei öffnen, um die Termine einzutragen.');
    } catch (e) { HA.hinweis(dlFehler(e)); }
    setTimeout(HA.rerender, 150);
  }
  HA.views.kalender = { title: 'Kalender', body: () => {
    const k = L.kalenderListe(S, L.heute());
    const alle = h('button', { type: 'button', class: 'btn primary', onclick: e => kalLaden(k.neu, e.currentTarget) }, k.neu.length === 1 ? 'Termin als Kalenderdatei laden' : 'Alle ' + k.neu.length + ' Termine als eine Datei laden');
    return [
      h('div', { class: 'card box' }, h('b', null, 'Kalender: ' + k.neu.length + ' neu, ' + k.loeschen.length + ' löschen'),
        h('span', { class: 'note' }, 'Die App darf keine Kalenderdatei (.ics) direkt speichern. Du bekommst deshalb eine ZIP-Datei, in der die Kalenderdatei liegt: ZIP öffnen, dann die Datei darin antippen und im Kalender hinzufügen. Jeder Termin hat einen Alarm um 9 Uhr, Kündigungsfristen zusätzlich ' + S.einst.vorlauf + ' Tage vorher.')),
      HA.sect('Neu eintragen', k.neu.length ? [alle, HA.card(k.neu.map(f => h('div', { class: 'row' }, h('span', { class: 'txt' }, h('span', { class: 't' }, f.titel), h('span', { class: 's' }, L.fmt(f.datum))),
        h('button', { type: 'button', class: 'btn small', onclick: e => kalLaden([f], e.currentTarget) }, 'Einzeln laden'))))] : HA.leer('Alle offenen Termine sind eingetragen.')),
      HA.sect('Im Kalender löschen', k.loeschen.length ? [h('p', { class: 'note' }, 'Diese Einträge stehen noch in deinem Kalender, stimmen aber nicht mehr. Bitte dort löschen und hier bestätigen.'),
        HA.card(k.loeschen.map(x => h('div', { class: 'row stripe warn' }, h('span', { class: 'txt' }, h('span', { class: 't' }, x.titel), h('span', { class: 's' }, L.fmt(x.datum) + ' · ' + x.grund)),
          h('button', { type: 'button', class: 'btn small', onclick: async e => { e.currentTarget.disabled = true; try { await HA.db().doc('fristen/' + x.id).set(L.kalGeloescht(HA.byId('fristen', x.id), x.datum)); } catch (er) { HA.toast('Hat nicht geklappt.'); } setTimeout(HA.rerender, 150); } }, 'Gelöscht'))))] : HA.leer('Nichts zu löschen.')),
      k.eingetragen.length ? h('details', { class: 'card box' }, h('summary', null, 'Eingetragen (' + k.eingetragen.length + ')'), h('ul', { class: 'ul' }, k.eingetragen.map(f => h('li', null, L.fmt(f.datum) + ' · ' + f.titel)))) : null,
      h('p', { class: 'note' }, '„Eingetragen“ heißt: Die Datei wurde geladen. Ob der Termin wirklich im Kalender steht, kann die App nicht sehen.'),
    ];
  } };

  /* ---------- Excel, Sicherung, Import ---------- */
  async function excel(knopf) {
    knopf.disabled = true;
    try {
      const XLSX = await lade('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX'), wb = XLSX.utils.book_new(), t = L.exportTabellen(S, L.heute());
      for (const name in t) { const ws = XLSX.utils.json_to_sheet(t[name].length ? t[name] : [{ Hinweis: 'keine Einträge' }]); ws['!cols'] = Object.keys(t[name][0] || { Hinweis: 1 }).map(k => ({ wch: Math.min(48, Math.max(k.length + 2, ...t[name].slice(0, 200).map(r => String(r[k] == null ? '' : r[k]).length + 2))) })); XLSX.utils.book_append_sheet(wb, ws, name); }
      await speichern('Haushalt-Export-' + L.heute() + '.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
      HA.toast('Excel-Datei geladen');
    } catch (e) { HA.hinweis(dlFehler(e)); }
    knopf.disabled = false;
  }
  const ENDUNG = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
  async function sichern(knopf, mitDateien, st) {
    knopf.disabled = true;
    try {
      const seiten = {}; let i = 0;
      /* auch verworfene Einträge gehören in die Sicherung */
      const Sall = Object.assign({}, S); for (const c of L.SICHER_COLS) Sall[c] = S[c].concat(S.weg[c] || []);
      for (const d of Sall.dokumente) { st('Texte werden gesammelt: ' + (++i) + ' von ' + Sall.dokumente.length); const snap = await HA.db().collection('dokumente').doc(d.id).collection('seiten').get(); seiten[d.id] = snap.docs.map(x => Object.assign({ id: x.id }, x.data())); }
      const b = L.sicherung(Sall, seiten, L.heute()), dateien = [], fehlt = [];
      try { const k = await HA.db().doc('einstellungen/schwaerzliste').get(); if (k.exists) b.schwaerzlisteVerschluesselt = k.data(); } catch (x) { /* ohne Liste weiter */ }
      if (mitDateien) {
        const alle = Sall.dokumente.flatMap(d => d.dateien || []); i = 0;
        for (const f of alle) { st('Originaldateien werden geholt: ' + (++i) + ' von ' + alle.length);
          try { const r = await fetch('/_blob/' + f.id); if (!r.ok) throw 0; dateien.push({ name: 'dateien/' + f.id + '.' + (ENDUNG[f.typ] || 'bin'), data: await r.blob() }); } catch (e) { fehlt.push(f.id); } }
      }
      b.mitDateien = !!mitDateien; b.dateienFehlen = fehlt;
      st('Datei wird gepackt …');
      const namen = L.mdNamen(S.dokumente), md = S.dokumente.map(d => ({ name: 'dokumente-markdown/' + namen[d.id], data: L.dokMarkdown(d, seiten[d.id], S) }));
      await speichern('Haushalt-Sicherung-' + L.heute() + '.zip', await zip([{ name: 'sicherung.json', data: JSON.stringify(b) }].concat(md, dateien)));
      st('Sicherung geladen.' + (fehlt.length ? ' ' + fehlt.length + ' Originaldatei(en) konnten nicht geholt werden und fehlen in der Sicherung.' : '') + (mitDateien ? '' : ' Ohne Originaldateien.'));
    } catch (e) { st(dlFehler(e)); }
    knopf.disabled = false;
  }
  const holeSeiten = async id => (await HA.db().collection('dokumente').doc(id).collection('seiten').get()).docs.map(x => Object.assign({ id: x.id }, x.data()));
  HA.holeSeiten = holeSeiten;
  /* Ein Dokument als Markdown-Datei */
  HA.mdLaden = async function (d, knopf) {
    knopf.disabled = true;
    try { await speichern(L.mdNamen([d])[d.id], L.dokMarkdown(d, await holeSeiten(d.id), S)); HA.toast('Markdown-Datei geladen'); } catch (e) { HA.hinweis(dlFehler(e)); }
    knopf.disabled = false;
  };
  /* Alle Dokumente: eine ZIP-Datei mit einer Markdown-Datei je Dokument */
  async function mdAlle(knopf, st) {
    knopf.disabled = true;
    try {
      const namen = L.mdNamen(S.dokumente), dateien = []; let i = 0;
      for (const d of S.dokumente) { st('Texte werden gesammelt: ' + (++i) + ' von ' + S.dokumente.length); dateien.push({ name: namen[d.id], data: L.dokMarkdown(d, await holeSeiten(d.id), S) }); }
      st('Datei wird gepackt …');
      await speichern('Haushalt-Dokumente-Markdown-' + L.heute() + '.zip', await zip(dateien));
      st(dateien.length + (dateien.length === 1 ? ' Markdown-Datei geladen.' : ' Markdown-Dateien geladen.'));
    } catch (e) { st(dlFehler(e)); }
    knopf.disabled = false;
  }
  async function leseSicherung(file) {
    if (/\.json$/i.test(file.name)) return { b: JSON.parse(await file.text()), z: null };
    const JSZip = await lade('jszip.min.js', 'JSZip'), z = await JSZip.loadAsync(file), j = z.file('sicherung.json');
    if (!j) throw { code: 'fremd' };
    return { b: JSON.parse(await j.async('string')), z };
  }
  async function importieren(v, st) {
    const db = HA.db(), imp = v.imp, map = {};
    try {
      if (v.z) { /* Originaldateien, die es in dieser App nicht mehr gibt, neu hochladen */
        const assets = await window.claude.use('assets'), da = new Set(assets ? (await assets.list()).assets.map(a => a.id) : []), namen = Object.keys(v.z.files).filter(n => n.startsWith('dateien/') && !v.z.files[n].dir); let i = 0;
        for (const n of namen) { const id = n.slice(8).replace(/\.\w+$/, ''); st('Originaldateien: ' + (++i) + ' von ' + namen.length);
          if (da.has(id) || !assets) continue;
          const end = n.split('.').pop(), typ = Object.keys(ENDUNG).find(t => ENDUNG[t] === end);
          if (typ) map[id] = (await assets.upload(new Blob([await v.z.files[n].async('arraybuffer')], { type: typ }), { type: typ })).id; }
      }
      let i = 0;
      for (const o of imp.ops) {
        if (++i % 10 === 0 || i === imp.ops.length) st('Einträge werden geschrieben: ' + i + ' von ' + imp.ops.length);
        if (o.pfad.startsWith('dokumente/') && o.pfad.split('/').length === 2 && o.data.dateien) o.data.dateien = o.data.dateien.map(f => map[f.id] ? Object.assign({}, f, { id: map[f.id] }) : f);
        try { await db.doc(o.pfad).set(o.data); } catch (e) { if (e && e.code === 'resource_exhausted') { await new Promise(r => setTimeout(r, 2500)); await db.doc(o.pfad).set(o.data); } else throw e; }
      }
      v.imp = null; v.z = null; v.fertig = 'Import abgeschlossen: ' + imp.ops.length + ' Einträge geschrieben.'; HA.rerender();
    } catch (e) { st('Der Import ist abgebrochen (' + (e && e.code || 'Fehler') + '). Schon geschriebene Einträge bleiben. Du kannst den Import einfach wiederholen.'); }
  }
  HA.views.export = { title: 'Export und Sicherung', body: v => {
    const st = h('p', { class: 'note', id: 'xstatus' }, v.fertig || ''), mit = h('input', { id: 'x_mit', type: 'checkbox', checked: true });
    const setSt = t => { st.textContent = t; };
    const z = v.imp && v.imp.zahl;
    return [
      HA.sect('Excel', h('p', { class: 'note' }, 'Eine Tabelle je Bereich: Verträge, Fassungen, Firmen, Dinge, Belege, § 35a, Termine, Dokumente mit Steckbrief, Schadenfälle, Zeitleiste. Ohne Dokumenttexte.'),
        h('button', { type: 'button', class: 'btn primary', onclick: e => excel(e.currentTarget) }, 'Alles als Excel exportieren')),
      HA.sect('Dokumente als Markdown', h('p', { class: 'note' }, 'Je Dokument eine Markdown-Datei mit Kopfdaten, Steckbrief und dem geschwärzten Text Seite für Seite, zusammen in einer ZIP-Datei. Lesbar in jedem Texteditor.'),
        S.dokumente.length ? h('button', { type: 'button', class: 'btn', onclick: e => mdAlle(e.currentTarget, setSt) }, 'Alle ' + S.dokumente.length + ' Dokumente als Markdown laden') : HA.leer('Noch keine Dokumente gespeichert.')),
      HA.sect('Datensicherung', h('p', { class: 'note' }, 'Eine ZIP-Datei mit allen Einträgen und Dokumenttexten, auf Wunsch mit den Originaldateien. Die Markdown-Dateien liegen zusätzlich im Ordner „dokumente-markdown“. Die Schwärzliste ist nur verschlüsselt enthalten, wenn du ein Passwort festgelegt hast.'),
        h('div', { class: 'field check' }, mit, h('label', { for: 'x_mit' }, 'Originaldateien einschließen')),
        h('button', { type: 'button', class: 'btn', onclick: e => sichern(e.currentTarget, mit.checked, setSt) }, 'Datensicherung laden')),
      HA.sect('Import aus Sicherung', h('p', { class: 'note' }, 'Einträge mit gleicher Kennung werden überschrieben, alles andere bleibt. Es wird nichts gelöscht.'),
        h('label', { class: 'btn', for: 'x_datei' }, 'Sicherungsdatei wählen'), h('input', { id: 'x_datei', type: 'file', accept: '.zip,.json,application/zip,application/json', class: 'vh', onchange: async e => {
          const f = e.target.files[0]; if (!f) return;
          try { const r = await leseSicherung(f), imp = L.importOps(r.b); if (imp.fehler) throw { code: 'fremd' }; v.imp = imp; v.z = r.z; v.vom = r.b.erstellt; v.fertig = ''; }
          catch (x) { v.imp = null; v.fertig = 'Diese Datei ist keine Sicherung der Haushalts-App oder sie ist beschädigt.'; }
          HA.rerender();
        } }),
        z ? h('div', { class: 'card box warn' }, h('b', null, 'Sicherung vom ' + L.fmt(v.vom)),
          h('span', null, z.vertraege + ' Verträge, ' + z.dokumente + ' Dokumente (' + z.seiten + ' Seiten Text), ' + z.belege + ' Belege, ' + z.fristen + ' Termine, ' + z.firmen + ' Firmen, ' + z.dinge + ' Dinge, ' + z.schadenfaelle + ' Schadenfälle.'),
          h('button', { type: 'button', class: 'btn primary', onclick: e => { e.currentTarget.disabled = true; importieren(v, setSt); } }, 'Jetzt importieren')) : null),
      st];
  } };
})();

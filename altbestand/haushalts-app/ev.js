/* Haushalts-App, Stufe (c): Ereignisse mit Folgen, Fassungen, Lebensereignisse, Kündigungsentwurf. */
(function () {
  'use strict';
  const HA = window.HA, { h, $, S, L } = HA;
  const vFeld = k => HA.SCHEMA.vertraege.felder.find(f => f.k === k);

  /* Schreib-Schritte aus logic.js nacheinander ausführen. */
  async function anwenden(ops) {
    const db = HA.db();
    for (const o of ops) {
      const c = db.collection(o.col);
      if (o.op === 'add') await c.add(o.data);
      else if (o.op === 'set') await c.doc(o.id).set(o.data);
      else if (o.op === 'update') await c.doc(o.id).update(o.data);
      else { const d = Object.assign({}, HA.byId(o.col, o.id), o.data); delete d.id; for (const k of o.entfernen || []) delete d[k]; await c.doc(o.id).set(d); }
    }
  }
  HA.anwenden = anwenden;

  /* Nach jedem Speichern von Hand: Fassung fortschreiben, Folgen bei Dingen auslösen. */
  HA.nachSpeichern = async function (col, id, data, old, extra) {
    const heute = L.heute();
    if (col === 'vertraege' && !old) {
      const f = { vertragId: id, gueltigVon: data.beginn || data.abschluss || (extra && extra.gueltigVon) || heute, grund: 'Vertrag angelegt' };
      for (const k of L.FKEYS) if (data[k] != null) f[k] = data[k];
      if (extra && extra.dokumentId) f.dokumentId = extra.dokumentId;
      await HA.db().collection('fassungen').add(f);
    } else if (col === 'vertraege') {
      const werte = {}; let anders = false;
      for (const k of L.FKEYS) if ((old[k] == null ? null : old[k]) !== (data[k] == null ? null : data[k])) { werte[k] = data[k] == null ? null : data[k]; anders = true; }
      if (anders) await anwenden(L.fassungOps(Object.assign({ id }, old), werte, heute, 'Von Hand geändert', S));
    } else if (col === 'dinge' && old) {
      const r = L.dingFolgen(Object.assign({ id }, data), old.status, S, heute);
      if (r.ops.length) { await anwenden(r.ops); return r.hinweise; }
    }
    return [];
  };

  /* Beim Öffnen: Vertragsende und verpasste Fristen nachziehen. */
  /* Läuft nach jedem Laden von Daten, also auch nach dem Anlegen oder Ändern eines Vertrags. Nach einem Lauf gibt es nichts mehr zu tun. */
  let wartLaeuft = false, wartLaeufe = 0;
  HA.wartung = async function () {
    if (wartLaeuft || wartLaeufe >= 20) return;
    const ops = L.wartung(S, L.heute());
    if (!ops.length) return;
    wartLaeuft = true; wartLaeufe++;
    try { await anwenden(ops); HA.toast('Laufzeiten wurden automatisch nachgezogen. Details in der Zeitleiste.'); } catch (e) { /* nächster Versuch beim nächsten Laden */ }
    wartLaeuft = false;
  };

  /* ---------- Ereignis am Vertrag ---------- */
  const TYPEN = {
    erhoehung: { name: 'Beitrags- oder Preisänderung', wann: v => L.laeuft(v), felder: v => [
      { k: 'beitrag', l: 'Neuer Beitrag in €', t: 'number', req: true }, Object.assign({}, vFeld('zahlweise'), { def: v.zahlweise || 'monatlich' }),
      { k: 'gueltigAb', l: 'Gilt ab', t: 'date', req: true }, { k: 'zugang', l: 'Mitteilung zugegangen am', t: 'date', req: true, def: L.heute() }] },
    nachtrag: { name: 'Nachtrag oder Tarifwechsel', wann: v => L.laeuft(v), felder: v => [{ k: 'gueltigAb', l: 'Gültig ab', t: 'date', req: true }].concat(L.FKEYS.map(k => Object.assign({}, vFeld(k), { def: v[k] != null ? v[k] : vFeld(k).def }))) },
    kuendigung: { name: 'Kündigung versendet', wann: v => v.status === 'aktiv', felder: v => [
      { k: 'am', l: 'Versendet am', t: 'date', req: true, def: L.heute() }, { k: 'zum', l: 'Gekündigt zum (letzter Vertragstag)', t: 'date', req: true, def: v.laufzeitende || '' }] },
    bestaetigung: { name: 'Kündigungsbestätigung erhalten', wann: v => L.laeuft(v) && !v.bestaetigt, felder: v => [
      { k: 'zum', l: 'Vertragsende laut Bestätigung', t: 'date', req: true, def: v.gekuendigtZum || v.laufzeitende || '' }] },
    ersatz: { name: 'Ersatzvertrag verknüpfen', wann: v => !v.ersetztDurchId, felder: v => [
      { k: 'ersatzId', l: 'Ersatzvertrag', t: 'select', req: true, opt: [['', '–']].concat(S.vertraege.filter(x => x.id !== v.id && (L.laeuft(x) || x.status === 'angebot')).map(x => [x.id, x.kurzname])), hint: 'Für die Lückenprüfung braucht der Ersatzvertrag einen Vertragsbeginn.' }] },
  };
  HA.views.ereignis = { title: 'Ereignis', body: v => {
    const r = HA.byId('vertraege', v.vertragId);
    if (!r) return [HA.leer('Der Vertrag ist nicht mehr vorhanden.')];
    if (!v.typ) {
      const moeglich = Object.keys(TYPEN).filter(t => TYPEN[t].wann(r));
      return [h('p', { class: 'note' }, r.kurzname + ': Was ist passiert? Die App zieht Fristen, Kosten und Termine nach.'),
        moeglich.length ? HA.card(moeglich.map(t => h('button', { type: 'button', class: 'row', onclick: () => { v.typ = t; HA.rerender(); } }, h('span', { class: 't' }, TYPEN[t].name)))) : HA.leer('Für diesen Vertrag ist kein Ereignis mehr möglich.')];
    }
    const def = TYPEN[v.typ], felder = def.felder(r), err = h('p', { class: 'err', hidden: true }), btn = h('button', { type: 'submit', class: 'btn primary' }, 'Eintragen');
    return [h('form', { novalidate: true, onsubmit: async ev => {
      ev.preventDefault();
      const d = HA.readFields(felder, 'e_');
      if (d.error) { err.textContent = d.error; err.hidden = false; d.el.focus(); return; }
      const e = d.data;
      if (v.typ === 'nachtrag') for (const k of L.FKEYS) if (!(k in e)) e[k] = null;
      if (v.dokumentId) e.dokumentId = v.dokumentId;
      btn.disabled = true; err.hidden = true;
      try {
        const f = L.ereignisFolgen(v.typ, r, e, S, L.heute());
        await anwenden(f.ops);
        HA.pop(); HA.push({ name: 'folgen', titel: f.text, hinweise: f.hinweise }); HA.rerender(); window.scrollTo(0, 0);
      } catch (x) { btn.disabled = false; err.textContent = 'Eintragen hat nicht geklappt (' + (x && x.code || 'Fehler') + '). Bitte den Vertrag prüfen, bevor du es noch einmal versuchst.'; err.hidden = false; }
    } }, h('p', { class: 'note' }, r.kurzname + ': ' + def.name + (v.dokumentId ? '. Vorschlag aus dem Dokument, bitte prüfen.' : '')),
      felder.map(f => HA.fieldEl(f, v.preset && v.preset[f.k] != null ? v.preset[f.k] : undefined, 'e_')), err,
      h('div', { class: 'btnrow' }, btn, h('button', { type: 'button', class: 'btn', onclick: HA.back }, 'Abbrechen')))];
  } };
  HA.views.folgen = { title: 'Eingetragen', body: v => [
    h('div', { class: 'card box' }, h('b', null, v.titel), h('span', { class: 'note' }, 'Das hat die App nachgezogen:')),
    v.hinweise.length ? HA.card(v.hinweise.map(t => h('div', { class: 'row' }, h('span', { class: 't' }, t)))) : HA.leer('Keine weiteren Folgen.'),
    (() => { const p = h('p', { class: 'note' }, ''); setTimeout(() => { const k = HA.kalenderZahl(); p.textContent = 'Kalender: ' + k.neu + ' neu, ' + k.loeschen + ' löschen.'; }, 900); return p; })(),
    h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', onclick: HA.back }, 'Fertig'), h('button', { type: 'button', class: 'btn', onclick: () => { HA.pop(); HA.go({ name: 'kalender' }); } }, 'Kalender abgleichen'))] };

  /* ---------- Kündigungsentwurf ---------- */
  HA.views.entwurf = { title: 'Kündigung entwerfen', body: v => {
    const r = HA.byId('vertraege', v.vertragId), fa = r && HA.byId('firmen', r.firmaId);
    if (!r) return [HA.leer('Der Vertrag ist nicht mehr vorhanden.')];
    const ta = h('textarea', { id: 'entwurf', style: 'min-height:340px' }); ta.value = L.kuendigungsText(r, fa, L.heute(), S.einst.texte && S.einst.texte.kuendigung);
    const kj = L.kuendigungJetzt(r, L.heute());
    return [
      h('div', { class: 'card box' }, kj ? [h('b', null, kj.art === 'termin' ? 'Zugang beim Anbieter bis ' + L.fmt(kj.bis) : kj.art === 'jederzeit' ? 'Jederzeit kündbar' + (kj.zum ? ': Vertragsende frühestens ' + L.fmt(kj.zum) : '') : 'Kündigungsfrist verstrichen'), h('span', null, kj.text)] : h('b', null, r.laufzeitende ? 'Keine Kündigungsfrist eingetragen' : 'Unbefristet: Frist laut Vertrag ab Zugang'),
        h('span', null, 'Der Zugang beim Anbieter zählt, nicht der Versand. Verschicke mit Nachweis, zum Beispiel per Einschreiben oder mit Sendebericht.'),
        r.kuendigungsweg && h('span', null, 'Kündigungsweg laut Vertrag: ' + r.kuendigungsweg),
        r.online && h('span', null, 'Online abgeschlossen: Der Anbieter muss auf seiner Website einen Kündigungsbutton anbieten.'),
        h('span', { class: 'note' }, 'Entwurf, keine Rechtsberatung und keine Empfehlung. Im Zweifel gilt die Frist im Vertrag.')),
      h('div', { class: 'field' }, h('label', { for: 'entwurf' }, 'Entwurf: [Name], [Adresse] und [Kundennummer] selbst ersetzen'), ta),
      h('div', { class: 'btnrow' },
        h('button', { type: 'button', class: 'btn primary', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); HA.toast('Text kopiert'); } catch (e) { ta.focus(); ta.select(); HA.toast('Bitte den markierten Text von Hand kopieren.'); } } }, 'Text kopieren'),
        r.status === 'aktiv' && h('button', { type: 'button', class: 'btn', onclick: () => { HA.pop(); HA.go({ name: 'ereignis', vertragId: r.id, typ: 'kuendigung' }); } }, 'Als versendet eintragen'))];
  } };

  /* ---------- Lebensereignisse: eingebaute und eigene ---------- */
  const einstSpeichern = async e => { S.einst = e; L.setEigene(e.eigene); await HA.db().doc('einstellungen/haushalt').set(e); };
  HA.einstSpeichern = einstSpeichern;
  HA.views.leben = { title: 'Lebensereignis', body: v => {
    const alle = L.lebenListe(S.einst);
    if (!v.typ) return [h('p', { class: 'note' }, 'Die App legt Aufgaben zum Prüfen an. Sie berät nicht.'),
      alle.length ? HA.card(alle.map(d => h('button', { type: 'button', class: 'row', onclick: () => { v.typ = d.key; HA.rerender(); } }, h('span', { class: 'txt' }, h('span', { class: 't' }, d.name), h('span', { class: 's' }, d.aufgaben.length + (d.aufgaben.length === 1 ? ' Aufgabe' : ' Aufgaben') + (d.eigen ? ' · eigenes' : '')))))) : HA.leer('Keine Lebensereignisse vorhanden.'),
      h('button', { type: 'button', class: 'btn', onclick: () => HA.go({ name: 'lebenEdit' }) }, 'Lebensereignisse anpassen')];
    const def = alle.find(d => d.key === v.typ);
    if (!def) return [HA.leer('Dieses Lebensereignis gibt es nicht mehr.')];
    const autos = S.dinge.filter(d => d.kategorie === 'Auto' && (d.status || 'aktiv') === 'aktiv');
    const felder = [{ k: 'datum', l: 'Wann', t: 'date', req: true, def: L.heute() }].concat(def.auto ? [{ k: 'dingId', l: 'Welches Auto', t: 'select', req: true, opt: [['', '–']].concat(autos.map(d => [d.id, d.name])), hint: autos.length ? '' : 'Kein aktives Auto eingetragen. Bitte erst unter „Auto“ anlegen.' }] : []);
    const err = h('p', { class: 'err', hidden: true }), btn = h('button', { type: 'submit', class: 'btn primary' }, 'Aufgaben anlegen');
    return [h('form', { novalidate: true, onsubmit: async ev => {
      ev.preventDefault();
      const d = HA.readFields(felder, 'l_');
      if (d.error) { err.textContent = d.error; err.hidden = false; d.el.focus(); return; }
      btn.disabled = true;
      try {
        const heute = L.heute(), f = L.lebensFolgen(def, d.data.datum, S, heute, d.data.dingId); let hin = f.hinweise;
        if (d.data.dingId) {
          const ding = HA.byId('dinge', d.data.dingId), neu = Object.assign({}, ding, { status: 'verkauft' }), df = L.dingFolgen(neu, ding.status, S, heute);
          f.ops.push({ op: 'update', col: 'dinge', id: ding.id, data: { status: 'verkauft' } }, ...df.ops); hin = hin.concat('Status von ' + ding.name + ': verkauft', df.hinweise);
        }
        await anwenden(f.ops);
        HA.pop(); HA.push({ name: 'folgen', titel: def.name, hinweise: hin }); HA.rerender(); window.scrollTo(0, 0);
      } catch (x) { btn.disabled = false; err.textContent = 'Anlegen hat nicht geklappt. Bitte die Termine prüfen, bevor du es noch einmal versuchst.'; err.hidden = false; }
    } }, h('div', { class: 'card box' }, h('b', null, def.name), h('ul', { class: 'ul' }, def.aufgaben.map(a => h('li', null, a))), def.rolle ? h('span', { class: 'note' }, 'Dazu je laufendem Vertrag für „' + def.rolle + '“ eine Prüfaufgabe.') : null),
      felder.map(f => HA.fieldEl(f, undefined, 'l_')), err,
      h('div', { class: 'btnrow' }, btn, h('button', { type: 'button', class: 'btn', onclick: HA.back }, 'Abbrechen')))];
  } };
  HA.views.lebenEdit = { title: 'Lebensereignisse anpassen', body: v => {
    const l = S.einst.leben || {}, eigene = l.eigene || [], weg = l.versteckt || [];
    const speichern = async neu => { try { await einstSpeichern(Object.assign({}, S.einst, { leben: Object.assign({ eigene, versteckt: weg }, neu) })); } catch (e) { HA.toast('Speichern hat nicht geklappt.'); } v.edit = null; v.frage = null; HA.rerender(); };
    if (v.edit) {
      const alt = eigene.find(x => x.id === v.edit) || {}, ta = h('textarea', { id: 'le_aufgaben', style: 'min-height:180px' }); ta.value = (alt.aufgaben || []).join('\n');
      const felder = [{ k: 'name', l: 'Name', req: true }, { k: 'rolle', l: 'Verträge dieser Rolle zur Prüfung vorlegen', t: 'select', opt: L.ENUM.rolle }], err = h('p', { class: 'err', hidden: true });
      return [h('form', { novalidate: true, onsubmit: ev => {
        ev.preventDefault();
        const d = HA.readFields(felder, 'le_'), aufgaben = ta.value.split('\n').map(x => x.trim()).filter(Boolean);
        if (d.error || !aufgaben.length) { err.textContent = d.error || 'Bitte mindestens eine Aufgabe eintragen.'; err.hidden = false; return; }
        const neu = Object.assign({ id: alt.id || 'e' + Date.now().toString(36), aufgaben }, d.data);
        speichern({ eigene: alt.id ? eigene.map(x => x.id === alt.id ? neu : x) : eigene.concat([neu]) });
      } }, felder.map(f => HA.fieldEl(f, alt[f.k], 'le_')),
        h('div', { class: 'field' }, h('label', { for: 'le_aufgaben' }, 'Aufgaben, eine je Zeile *'), ta, h('span', { class: 'hint' }, 'Jede Zeile wird ein Termin zum Datum des Ereignisses. Unsicheres mit [prüfen] kennzeichnen.')),
        err, h('div', { class: 'btnrow' }, h('button', { type: 'submit', class: 'btn primary' }, 'Speichern'), h('button', { type: 'button', class: 'btn', onclick: () => { v.edit = null; HA.rerender(); } }, 'Abbrechen')))];
    }
    return [
      h('button', { type: 'button', class: 'btn primary', onclick: () => { v.edit = 'neu'; HA.rerender(); } }, '+ Eigenes Lebensereignis'),
      HA.sect('Eigene', eigene.length ? HA.card(eigene.map(x => h('div', { class: 'row' }, h('span', { class: 'txt' }, h('span', { class: 't' }, x.name), h('span', { class: 's' }, (x.aufgaben || []).length + ' Aufgaben' + (x.rolle ? ' · ' + x.rolle : ''))),
        h('button', { type: 'button', class: 'btn small', onclick: () => { v.edit = x.id; HA.rerender(); } }, 'Ändern'),
        v.frage === x.id ? h('button', { type: 'button', class: 'btn small', style: 'border-color:var(--crit);color:var(--crit)', onclick: () => speichern({ eigene: eigene.filter(y => y.id !== x.id) }) }, 'Wirklich löschen')
          : h('button', { type: 'button', class: 'btn small', onclick: () => { v.frage = x.id; HA.rerender(); } }, 'Löschen')))) : HA.leer('Noch keine eigenen Lebensereignisse.')),
      HA.sect('Eingebaut', HA.card(Object.keys(L.LEBEN).map(k => h('div', { class: 'row' }, h('span', { class: 'txt' }, h('span', { class: 't' }, L.LEBEN[k].name), h('span', { class: 's' }, weg.includes(k) ? 'ausgeblendet' : L.LEBEN[k].aufgaben.length + ' Aufgaben')),
        h('button', { type: 'button', class: 'btn small', onclick: () => speichern({ versteckt: weg.includes(k) ? weg.filter(y => y !== k) : weg.concat([k]) }) }, weg.includes(k) ? 'Einblenden' : 'Ausblenden')))),
        h('p', { class: 'note' }, 'Eingebaute Lebensereignisse lassen sich ausblenden, aber nicht ändern. Für eine eigene Fassung: ausblenden und ein eigenes anlegen. Schon angelegte Aufgaben bleiben in jedem Fall erhalten.'))];
  } };

  /* ---------- Eigene Auswahlwerte in den Einstellungen ---------- */
  HA.eigeneUI = function () {
    const e = S.einst.eigene || {}, wert = h('input', { id: 'ew_wert', type: 'text' }), liste = h('select', { id: 'ew_liste' }, Object.keys(L.EIGEN_LISTEN).map(k => h('option', { value: k }, L.EIGEN_LISTEN[k])));
    const alle = Object.keys(L.EIGEN_LISTEN).flatMap(k => (e[k] || []).map(w => ({ k, w })));
    return HA.sect('Eigene Auswahlwerte',
      h('p', { class: 'note' }, 'Zusätzliche Werte für die Auswahllisten. Du kannst sie auch direkt in jeder Eingabemaske über „+ Eigener Wert“ anlegen. Entfernen nimmt den Wert nur aus der Auswahl, bestehende Einträge behalten ihn.'),
      alle.length ? HA.card(alle.map(x => h('div', { class: 'row' }, h('span', { class: 'txt' }, h('span', { class: 't' }, x.w), h('span', { class: 's' }, L.EIGEN_LISTEN[x.k])),
        h('button', { type: 'button', class: 'btn small', onclick: async () => { const n = Object.assign({}, e); n[x.k] = (e[x.k] || []).filter(y => y !== x.w); try { await einstSpeichern(Object.assign({}, S.einst, { eigene: n })); } catch (er) { HA.toast('Hat nicht geklappt.'); } HA.rerender(); } }, 'Entfernen')))) : HA.leer('Noch keine eigenen Werte.'),
      h('div', { class: 'field' }, h('label', { for: 'ew_liste' }, 'Liste'), liste), h('div', { class: 'field' }, h('label', { for: 'ew_wert' }, 'Neuer Wert'), wert),
      h('button', { type: 'button', class: 'btn', onclick: async () => { const n = L.mitEigenem(S.einst, liste.value, wert.value); if (!n) return HA.toast('Der Wert fehlt oder ist schon vorhanden.'); try { await einstSpeichern(n); } catch (er) { HA.toast('Hat nicht geklappt.'); } HA.rerender(); } }, 'Hinzufügen'));
  };

  HA.views.eigene = { title: 'Eigene Auswahlwerte', body: () => [HA.eigeneUI()] };
  /* ---------- Feste Texte anpassen ---------- */
  HA.views.texte = { title: 'Texte anpassen', body: () => {
    const t = S.einst.texte || {}, so = h('textarea', { id: 'tx_sofort', style: 'min-height:200px' }), ku = h('textarea', { id: 'tx_kuend', style: 'min-height:340px' });
    so.value = L.sofortListe(S.einst).join('\n'); ku.value = t.kuendigung || L.KUEND_STD;
    const sichern = async texte => { try { await einstSpeichern(Object.assign({}, S.einst, { texte })); HA.toast('Gespeichert'); } catch (e) { HA.toast('Speichern hat nicht geklappt.'); } HA.rerender(); };
    return [
      HA.sect('Sofortmaßnahmen im Schadenfall', h('div', { class: 'field' }, h('label', { for: 'tx_sofort' }, 'Eine Maßnahme je Zeile'), so)),
      HA.sect('Kündigungsentwurf', h('div', { class: 'field' }, h('label', { for: 'tx_kuend' }, 'Vorlage'), ku,
        h('span', { class: 'hint' }, 'Die App setzt ein: {Anbieter}, {Datum}, {Vertrag}, {Vertragsende}. [Name], [Adresse] und [Kundennummer] ersetzt du beim Verschicken selbst. Bitte keine echten Namen oder Nummern in die Vorlage schreiben.'))),
      h('div', { class: 'btnrow' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => { const zeilen = so.value.split('\n').map(x => x.trim()).filter(Boolean); if (!zeilen.length || ku.value.trim().length < 20) return HA.toast('Beide Texte dürfen nicht leer sein.'); sichern({ sofort: zeilen, kuendigung: ku.value }); } }, 'Speichern'),
        h('button', { type: 'button', class: 'btn', onclick: () => sichern({}) }, 'Auf Standard zurücksetzen'))];
  } };

  /* ---------- Zusätze auf der Vertragsseite ---------- */
  HA.vertragExtra = function (r) {
    const fs = S.fassungen.filter(f => f.vertragId === r.id).sort((a, b) => a.gueltigVon < b.gueltigVon ? 1 : -1);
    return {
      knoepfe: [h('button', { type: 'button', class: 'btn primary', onclick: () => HA.go({ name: 'ereignis', vertragId: r.id }) }, 'Ereignis eintragen'),
        r.status === 'aktiv' && h('button', { type: 'button', class: 'btn', onclick: () => HA.go({ name: 'entwurf', vertragId: r.id }) }, 'Kündigung entwerfen')],
      fassungen: fs.length > 1 ? HA.sect('Fassungen', HA.card(fs.map(f => h('div', { class: 'row' }, h('span', { class: 'txt' },
        h('span', { class: 't' }, 'ab ' + L.fmt(f.gueltigVon) + (f.gueltigBis ? ' bis ' + L.fmt(f.gueltigBis) : '')),
        h('span', { class: 's' }, [f.grund, f.laufzeitende ? 'Laufzeit bis ' + L.fmt(f.laufzeitende) : 'unbefristet'].filter(Boolean).join(' · '))),
        h('span', { class: 'r' }, f.beitrag ? HA.eur(L.proMonat(f)) + '/Monat' : ''))))) : null,
    };
  };
})();

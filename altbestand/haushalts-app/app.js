/* Haushalts-App: Oberfläche. Stufe (a): Datenmodell, Startseite, manuelles Anlegen. */
(function () {
  'use strict';
  const L = window.HL;
  const COLS = ['firmen', 'dinge', 'vertraege', 'belege', 'fristen', 'ereignisse', 'dokumente', 'fassungen', 'schadenfaelle', 'zaehler'];
  const S = { firmen: [], dinge: [], vertraege: [], belege: [], fristen: [], ereignisse: [], dokumente: [], fassungen: [], schadenfaelle: [], zaehler: [], weg: {}, einst: { vorlauf: 42 } };
  let db = null, ready = false, problem = '', mountedForm = null;
  const stack = [{ name: 'home' }];
  const view = () => stack[stack.length - 1];
  const $ = id => document.getElementById(id);
  const eur = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);

  const HA = window.HA = { views: {}, S, L };
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  let toastTimer;
  function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { e.hidden = true; }, 2600); }
  /* Längerer Hinweis, der stehen bleibt, bis man ihn schließt. */
  function hinweis(t) { clearTimeout(toastTimer); const e = $('toast'); e.replaceChildren(h('span', null, t), h('br'), h('button', { type: 'button', class: 'btn small', style: 'margin-top:8px', onclick: () => { e.hidden = true; } }, 'Schließen')); e.hidden = false; }
  const go = v => { mountedForm = null; stack.push(v); render(); window.scrollTo(0, 0); };
  const back = () => { mountedForm = null; if (stack.length > 1) stack.pop(); render(); };
  const byId = (col, id) => S[col].find(x => x.id === id);

  /* ---------- Auswahllisten und Formulare ---------- */
  const ZAHLWEISE = [['monatlich', 'monatlich'], ['zweimonatlich', 'alle 2 Monate'], ['vierteljaehrlich', 'vierteljährlich'], ['halbjaehrlich', 'halbjährlich'], ['jaehrlich', 'jährlich'], ['woechentlich', 'wöchentlich'], ['vierzehntaegig', 'alle 14 Tage'], ['einmalig', 'einmalig (zählt nicht zu den Fixkosten)']];
  const VERL = [['12m', '+12 Monate'], ['unbefristet', 'unbefristet, jederzeit kündbar'], ['vertrag', 'laut Vertrag']];
  const VSTATUS = [['angebot', 'Angebot'], ['aktiv', 'aktiv'], ['gekuendigt', 'gekündigt'], ['beendet', 'beendet'], ['ersetzt', 'ersetzt']];
  const STEUER = [['-', '–'], ['handwerker', '§ 35a Handwerker'], ['haushaltsnah', '§ 35a haushaltsnah']];
  const GEWART = [['keine', 'keine'], ['kauf', 'Kauf: 2 Jahre ab Übergabe'], ['bauwerk', 'Arbeiten am Bauwerk: 5 Jahre ab Abnahme'], ['wartung', 'Wartung/Reparatur: 2 Jahre [prüfen]']];
  const lab = (opts, v) => { const o = opts.find(x => x[0] === v); return o ? o[1] : (v || '–'); };

  const SCHEMA = {
    firmen: { ein: 'Firma', detail: true, felder: [
      { k: 'name', l: 'Name', req: true },
      { k: 'art', l: 'Art', t: 'select', liste: 'firmaArt' },
      { k: 'telefon', l: 'Telefon', t: 'tel' }, { k: 'email', l: 'E-Mail', t: 'email' },
      { k: 'hotline', l: 'Schaden-/Störungshotline', t: 'tel' },
      { k: 'web', l: 'Webadresse', t: 'web', hint: 'z. B. Kundenportal oder Kündigungsseite' },
      { k: 'notiz', l: 'Notiz', t: 'textarea', hint: 'Freier Text. Bitte keine Nummern oder Namen eintragen.' }] },
    dinge: { ein: 'Ding', detail: true, felder: [
      { k: 'name', l: 'Bezeichnung', req: true },
      { k: 'kategorie', l: 'Bereich', t: 'select', liste: 'dingKat', req: true },
      { k: 'hersteller', l: 'Hersteller' }, { k: 'modell', l: 'Modell' },
      { k: 'jahr', l: 'Kauf-/Baujahr', t: 'number' },
      { k: 'status', l: 'Status', t: 'select', opt: ['aktiv', 'ersetzt', 'verkauft'], def: 'aktiv' },
      { k: 'notiz', l: 'Notiz', t: 'textarea', hint: 'Freier Text. Bitte keine Nummern oder Namen eintragen.' }] },
    vertraege: { ein: 'Vertrag', detail: true, hinweis: 'Bitte keine Vertrags-, Kunden- oder Versicherungsnummern eintragen.', felder: [
      { k: 'kurzname', l: 'Kurzname', req: true },
      { k: 'art', l: 'Art', t: 'select', liste: 'vertragArt', req: true },
      { k: 'firmaId', l: 'Firma', t: 'ref', col: 'firmen' },
      { k: 'dingId', l: 'Bezug: Ding', t: 'ref', col: 'dinge' },
      { k: 'weitereDingIds', l: 'Weitere Dinge', t: 'multi', col: 'dinge' },
      { k: 'fuerWen', l: 'Für wen', t: 'select', liste: 'rolle', def: 'Familie' },
      { k: 'weitereRollen', l: 'Gilt auch für', t: 'multi', liste: 'rolle' },
      { k: 'beitrag', l: 'Beitrag in €', t: 'number' },
      { k: 'zahlweise', l: 'Zahlweise', t: 'select', opt: ZAHLWEISE, def: 'monatlich' },
      { k: 'abschluss', l: 'Abschlussdatum', t: 'date' },
      { k: 'beginn', l: 'Vertragsbeginn', t: 'date' },
      { k: 'laufzeitende', l: 'Laufzeitende (letzter Vertragstag)', t: 'date', hint: 'Leer lassen, wenn unbefristet.' },
      { k: 'fristWert', l: 'Kündigungsfrist', t: 'number' },
      { k: 'fristEinheit', l: 'Einheit der Frist', t: 'select', opt: ['Monate', 'Wochen', 'Tage'], def: 'Monate' },
      { k: 'verlaengerung', l: 'Verlängerung ohne Kündigung', t: 'select', opt: VERL, def: 'vertrag' },
      { k: 'web', l: 'Webadresse', t: 'web', hint: 'z. B. Kundenportal oder Kündigungsseite' },
      { k: 'kuendigungsweg', l: 'Kündigungsweg', hint: 'z. B. Textform per E-Mail, Brief, Kundenportal' },
      { k: 'online', l: 'Online abgeschlossen', t: 'check' },
      { k: 'status', l: 'Status', t: 'select', opt: VSTATUS, def: 'aktiv' },
      { k: 'gekuendigtAm', l: 'Kündigung versendet am', t: 'date' },
      { k: 'gekuendigtZum', l: 'Gekündigt zum', t: 'date' },
      { k: 'bestaetigt', l: 'Kündigungsbestätigung liegt vor', t: 'check' },
      { k: 'ersetztDurchId', l: 'Ersetzt durch', t: 'ref', col: 'vertraege' },
      { k: 'notiz', l: 'Notiz', t: 'textarea', hint: 'Freier Text. Bitte keine Nummern oder Namen eintragen.' }] },
    belege: { ein: 'Beleg', felder: [
      { k: 'titel', l: 'Wofür', req: true },
      { k: 'datum', l: 'Rechnungsdatum', t: 'date', req: true },
      { k: 'firmaId', l: 'Firma', t: 'ref', col: 'firmen' },
      { k: 'dingId', l: 'Ding', t: 'ref', col: 'dinge' },
      { k: 'betrag', l: 'Betrag in €', t: 'number' },
      { k: 'arbeitskosten', l: 'davon Arbeits-, Fahrt- und Maschinenkosten in €', t: 'number' },
      { k: 'steuer', l: 'Steuer', t: 'select', opt: STEUER, def: '-' },
      { k: 'unbar', l: 'Unbar bezahlt (Überweisung)', t: 'check' },
      { k: 'gewArt', l: 'Gewährleistung', t: 'select', opt: GEWART, def: 'keine' },
      { k: 'uebergabe', l: 'Übergabe/Abnahme am', t: 'date', hint: 'Leer: es zählt das Rechnungsdatum.' },
      { k: 'gewaehrleistungBis', l: 'Gewährleistung bis (nur wenn abweichend)', t: 'date' },
      { k: 'notiz', l: 'Notiz', t: 'textarea', hint: 'Freier Text. Bitte keine Nummern oder Namen eintragen.' }] },
    dokumente: { ein: 'Dokument', nichtNeu: true, felder: [
      { k: 'typ', l: 'Typ', t: 'select', liste: 'typ', req: true }, { k: 'titel', l: 'Titel', req: true },
      { k: 'datum', l: 'Datum des Dokuments', t: 'date' }, { k: 'gueltigVon', l: 'Gültig von', t: 'date' }, { k: 'gueltigBis', l: 'Gültig bis', t: 'date' },
      { k: 'vertragId', l: 'Gehört zu Vertrag', t: 'ref', col: 'vertraege' }, { k: 'dingId', l: 'Gehört zu Ding', t: 'ref', col: 'dinge' }, { k: 'firmaId', l: 'Firma', t: 'ref', col: 'firmen' }] },
    zaehler: { ein: 'Zähler', detail: true, hinweis: 'Bitte keine Zählernummer eintragen.', felder: [
      { k: 'name', l: 'Bezeichnung', req: true }, { k: 'art', l: 'Art', t: 'select', opt: ['Strom', 'Gas', 'Wasser', 'Wärme', 'Sonstiges'], req: true },
      { k: 'einheit', l: 'Einheit', t: 'select', opt: ['kWh', 'm³', 'MWh', 'Einheiten'], def: 'kWh', req: true },
      { k: 'vertragId', l: 'Gehört zu Vertrag', t: 'ref', col: 'vertraege' }, { k: 'dingId', l: 'Gehört zu Ding', t: 'ref', col: 'dinge' },
      { k: 'notiz', l: 'Notiz', t: 'textarea' }] },
    schadenfaelle: { ein: 'Schadenfall', nichtNeu: true, felder: [
      { k: 'status', l: 'Status', t: 'select', opt: ['offen', 'gemeldet', 'reguliert', 'abgelehnt', 'erledigt'], def: 'offen', req: true },
      { k: 'gemeldetAm', l: 'Gemeldet am', t: 'date' }, { k: 'gemeldetBei', l: 'Gemeldet bei (Police)', t: 'ref', col: 'vertraege' },
      { k: 'antwortAm', l: 'Antwort des Versicherers am', t: 'date' }, { k: 'antwort', l: 'Antwort des Versicherers', t: 'textarea', hint: 'Bitte keine Schadennummer eintragen.' },
      { k: 'beschreibung', l: 'Beschreibung', t: 'textarea', req: true }] },
    fristen: { ein: 'Termin', felder: [
      { k: 'titel', l: 'Titel', req: true },
      { k: 'datum', l: 'Datum', t: 'date', req: true },
      { k: 'vertragId', l: 'Gehört zu Vertrag', t: 'ref', col: 'vertraege' },
      { k: 'dingId', l: 'Gehört zu Ding', t: 'ref', col: 'dinge' },
      { k: 'notiz', l: 'Notiz', t: 'textarea' },
      { k: 'vorlaufTage', l: 'Vorlauf in Tagen', t: 'number', hint: 'Leer: Standard aus den Einstellungen.' },
      { k: 'wiederholung', l: 'Wiederholen', t: 'select', opt: [['1', 'monatlich'], ['3', 'vierteljährlich'], ['6', 'halbjährlich'], ['12', 'jährlich'], ['24', 'alle 2 Jahre'], ['36', 'alle 3 Jahre'], ['60', 'alle 5 Jahre']], hint: 'Beim Erledigen legt die App den nächsten Termin an.' },
      { k: 'status', l: 'Status', t: 'select', opt: ['offen', 'erledigt'], def: 'offen' }] },
  };
  const einh = (n, e) => n + ' ' + (Number(n) === 1 ? e.replace(/e$/, '').replace('Wochen', 'Woche') : e);
  const anz = (n, ein, mehr) => n + ' ' + (n === 1 ? ein : mehr);
  const nameOf = (col, r) => r ? (r.name || r.kurzname || r.titel || '–') : '–';

  /* Ein Formularfeld bauen; pre = Präfix der Feld-ID, damit mehrere Blöcke auf einer Seite stehen können.
     Auswahllisten mit f.liste lassen einen eigenen Wert zu, Verweise auf Firmen und Dinge einen neuen Eintrag. */
  const NEU_REF = { firmen: 'Neue Firma', dinge: 'Neues Ding', vertraege: 'Neuen Vertrag' };
  const NEU_KAT = { dinge: ['Bereich', 'dingKat'], vertraege: ['Art', 'vertragArt'] };
  function fieldEl(f, val, pre, selfId, extraHint) {
    const id = pre + f.k;
    if (val == null) val = f.def != null ? f.def : '';
    let inp, extra = null;
    if (f.t === 'multi') {
      const opts = f.col ? S[f.col].filter(r => r.id !== selfId).map(r => [r.id, nameOf(f.col, r)]) : L.ENUM[f.liste].map(o => [o, o]), sel = Array.isArray(val) ? val : [];
      return h('fieldset', { class: 'field multi', id }, h('legend', null, f.l), opts.length ? opts.map((o, i) => h('div', { class: 'field check' }, h('input', { type: 'checkbox', id: id + '_' + i, value: o[0], checked: sel.includes(o[0]) }), h('label', { for: id + '_' + i }, o[1]))) : h('span', { class: 'hint' }, 'Noch nichts angelegt.'));
    }
    if (f.t === 'select' || f.t === 'ref') {
      let opts = f.t === 'ref' ? S[f.col].filter(r => r.id !== selfId).map(r => [r.id, nameOf(f.col, r)]) : (f.liste ? L.ENUM[f.liste] : f.opt).map(o => Array.isArray(o) ? o : [o, o]);
      if (f.t === 'select' && val !== '' && !opts.some(o => o[0] === val)) opts = opts.concat([[val, val]]); /* gespeicherter Wert, der nicht mehr in der Liste steht */
      if (!f.req || f.t === 'ref') opts = [['', '–']].concat(opts);
      const neuRef = f.t === 'ref' && NEU_REF[f.col];
      if (f.liste) opts = opts.concat([['__eigen', '+ Eigener Wert …']]);
      if (neuRef) opts = opts.concat([['__neu', '+ ' + neuRef + ' anlegen …']]);
      if (f.liste || neuRef) {
        extra = h('div', { class: 'sub', hidden: true },
          h('div', { class: 'field' }, h('label', { for: id + '_neu' }, f.liste ? 'Eigener Wert für „' + f.l + '“' : 'Name'), h('input', { id: id + '_neu', type: 'text' })),
          neuRef && NEU_KAT[f.col] ? h('div', { class: 'field' }, h('label', { for: id + '_kat' }, NEU_KAT[f.col][0]), h('select', { id: id + '_kat' }, L.ENUM[NEU_KAT[f.col][1]].map(k => h('option', { value: k }, k)))) : null,
          h('span', { class: 'hint' }, f.liste ? 'Der Wert steht danach dauerhaft in der Auswahl. Entfernen kannst du ihn in den Einstellungen.' : 'Wird beim Speichern mit angelegt. Weitere Angaben trägst du später dort nach.'));
      }
      inp = h('select', { id, onchange: extra ? e => { extra.hidden = e.target.value !== '__eigen' && e.target.value !== '__neu'; if (!extra.hidden) $(id + '_neu').focus(); } : null }, opts.map(o => h('option', { value: o[0], selected: o[0] === val }, o[1])));
    } else if (f.t === 'check') inp = h('input', { id, type: 'checkbox', checked: !!val });
    else if (f.t === 'textarea') { inp = h('textarea', { id }); inp.value = val; }
    else if (f.t === 'web') inp = h('input', { id, type: 'text', inputmode: 'url', autocapitalize: 'off', value: val });
    else if (f.t === 'number') inp = h('input', { id, type: 'text', inputmode: 'decimal', value: val === '' ? '' : String(val).replace('.', ',') });
    else inp = h('input', { id, type: f.t || 'text', value: val });
    const hint = [extraHint, f.hint].filter(Boolean).join(' ');
    return f.t === 'check'
      ? h('div', { class: 'field check' }, inp, h('label', { for: id }, f.l + (extraHint ? ' ' + extraHint : '')))
      : h('div', { class: 'field' }, h('label', { for: id }, f.l + (f.req ? ' *' : '')), inp, extra, hint && h('span', { class: 'hint' }, hint));
  }
  /* Felder auslesen. Gibt {data, eigen, neu} oder {error, el} zurück. base = bestehender Datensatz (wird ergänzt).
     eigen = neue Auswahlwerte, neu = neu anzulegende Firmen/Dinge; beides erledigt danach abschliessen(). */
  function readFields(felder, pre, base) {
    const data = Object.assign({}, base), eigen = [], neu = []; delete data.id;
    for (const f of felder) {
      const el = $(pre + f.k); let val;
      if (!el) continue;
      if (f.t === 'multi') { const a = Array.from(el.querySelectorAll('input:checked')).map(x => x.value); if (a.length) data[f.k] = a; else delete data[f.k]; continue; }
      if (f.t === 'check') val = el.checked;
      else if (f.t === 'number') { val = el.value.trim() === '' ? '' : parseFloat(el.value.replace(/\./g, '').replace(',', '.')); if (val !== '' && isNaN(val)) return { error: '„' + f.l + '“ ist keine Zahl.', el }; }
      else val = el.value.trim();
      if (f.t === 'web' && val) { val = L.webAdresse(val); if (!val) return { error: '„' + f.l + '“ ist keine gültige Webadresse.', el }; }
      if (val === '__eigen' || val === '__neu') {
        const ne = $(pre + f.k + '_neu'), name = ne.value.trim();
        if (name.length < 2) return { error: 'Bitte den neuen Wert für „' + f.l + '“ eintragen.', el: ne };
        if (val === '__eigen') { eigen.push({ liste: f.liste, wert: name }); val = name; }
        else { neu.push({ k: f.k, col: f.col, name, kat: NEU_KAT[f.col] ? $(pre + f.k + '_kat').value : null }); val = '__neu'; }
      }
      if (f.req && val === '') return { error: 'Bitte „' + f.l + '“ ausfüllen.', el };
      if (val === '' || val === false) delete data[f.k]; else data[f.k] = val;
    }
    return { data, eigen, neu };
  }
  /* Nach dem Auslesen: neue Firmen/Dinge anlegen und eigene Auswahlwerte merken. */
  async function abschliessen(r) {
    for (const n of r.neu || []) {
      const ref = db.collection(n.col).doc(), d = n.col === 'vertraege' ? { kurzname: n.name, art: n.kat, status: 'aktiv', angelegt: L.heute() } : { name: n.name, angelegt: L.heute() };
      if (n.col === 'dinge') { d.kategorie = n.kat; d.status = 'aktiv'; }
      await ref.set(d);
      if (n.col === 'dinge') await db.collection('ereignisse').add({ datum: L.heute(), typ: 'angelegt', text: 'Angelegt', dingId: ref.id });
      if (n.col === 'vertraege') { await db.collection('ereignisse').add({ datum: L.heute(), typ: 'angelegt', text: 'Angelegt', vertragId: ref.id }); await HA.nachSpeichern('vertraege', ref.id, d, null); }
      r.data[n.k] = ref.id;
    }
    let e = S.einst, anders = false;
    for (const x of r.eigen || []) { const n = L.mitEigenem(e, x.liste, x.wert); if (n) { e = n; anders = true; } }
    if (anders) { S.einst = e; L.setEigene(e.eigene); await db.doc('einstellungen/haushalt').set(e); }
    return r.data;
  }
  function formView(v) {
    const sch = SCHEMA[v.col], old = v.id ? byId(v.col, v.id) : null, init = Object.assign({}, v.preset, old);
    const err = h('p', { class: 'err', hidden: true });
    const btn = h('button', { type: 'submit', class: 'btn primary' }, 'Speichern');
    const form = h('form', { novalidate: true, onsubmit: async ev => {
      ev.preventDefault();
      const r = readFields(sch.felder, 'f_', old || v.preset);
      if (r.error) { err.textContent = r.error; err.hidden = false; r.el.focus(); return; }
      btn.disabled = true; err.hidden = true;
      try {
        await abschliessen(r);
        const id = await save(v.col, v.id, r.data, old);
        mountedForm = null; stack.pop();
        if (!v.id && sch.detail) stack.push({ name: 'detail', col: v.col, id });
        toast('Gespeichert'); render();
      } catch (e) { btn.disabled = false; err.textContent = 'Speichern hat nicht geklappt (' + (e && e.code || 'Fehler') + '). Bitte noch einmal versuchen.'; err.hidden = false; }
    } }, sch.hinweis && h('p', { class: 'note' }, sch.hinweis), sch.felder.map(f => fieldEl(f, init[f.k], 'f_', v.id)), err,
      h('div', { class: 'btnrow' }, btn, h('button', { type: 'button', class: 'btn', onclick: back }, 'Abbrechen')),
      v.id ? verwerfenKnopf(v.col, v.id) : null);
    return [form];
  }

  /* Verwerfen: Eintrag verschwindet aus Listen, Summen und Fragen, bleibt aber gespeichert und lässt sich wiederherstellen. */
  function verwerfenKnopf(col, id) {
    const wrap = h('div', { class: 'btnrow' });
    const frage = () => wrap.replaceChildren(h('span', { class: 'note', style: 'flex-basis:100%' }, 'Der Eintrag verschwindet aus Listen, Summen und Fragen. Er bleibt gespeichert und lässt sich unter „Einstellungen → Verworfene Einträge“ wiederherstellen.'),
      h('button', { type: 'button', class: 'btn weg', onclick: async e => { e.currentTarget.disabled = true;
        try { await db.doc(col + '/' + id).update({ verworfen: true, verworfenAm: L.heute() }); mountedForm = null; while (stack.length > 1 && view().id === id) stack.pop(); toast('Verworfen'); render(); } catch (x) { toast('Hat nicht geklappt.'); } } }, 'Wirklich verwerfen'),
      h('button', { type: 'button', class: 'btn', onclick: start0 }, 'Doch nicht'));
    const start0 = () => wrap.replaceChildren(h('button', { type: 'button', class: 'btn weg', onclick: frage }, 'Eintrag verwerfen'));
    start0(); return wrap;
  }
  const leerGleich = x => x == null || x === false ? '' : Array.isArray(x) ? JSON.stringify(x) : x;
  async function save(col, id, data, old) {
    const ref = id ? db.collection(col).doc(id) : db.collection(col).doc();
    if (!id) data.angelegt = L.heute();
    await ref.set(data);
    if (col === 'fristen' && id && old.status !== 'erledigt' && data.status === 'erledigt') { const nx = L.naechsterTermin(data); if (nx) await db.collection('fristen').add(nx); }
    if (col === 'vertraege' || col === 'dinge') {
      const key = col === 'vertraege' ? 'vertragId' : 'dingId';
      const ge = id ? SCHEMA[col].felder.filter(f => leerGleich(old[f.k]) !== leerGleich(data[f.k])).map(f => f.l) : [];
      if (!id || ge.length) await db.collection('ereignisse').add({ datum: L.heute(), typ: id ? 'geaendert' : 'angelegt', text: id ? 'Von Hand geändert: ' + ge.join(', ') : 'Angelegt', [key]: ref.id });
      const hin = await HA.nachSpeichern(col, ref.id, data, id ? old : null);
      if (hin.length) { stack.pop(); stack.push({ name: 'folgen', titel: data.name + ': ' + data.status, hinweise: hin }, { name: 'x' }); }
    }
    return ref.id;
  }
  async function erledigt(f) {
    try {
      if (f.manuell) { await db.doc('fristen/' + f.id).update({ status: 'erledigt' }); const nx = L.naechsterTermin(byId('fristen', f.id) || {}); if (nx) { await db.collection('fristen').add(nx); return toast('Erledigt. Nächster Termin am ' + L.fmt(nx.datum) + ' angelegt.'); } }
      else { const d = Object.assign({ abgeleitet: true }, byId('fristen', f.id), { erledigtFuer: f.datum }); delete d.id; await db.doc('fristen/' + f.id).set(d); }
      toast('Als erledigt markiert');
    } catch (e) { toast('Hat nicht geklappt. Bitte noch einmal versuchen.'); }
  }

  /* ---------- Bausteine ---------- */
  const card = (...k) => h('div', { class: 'card rows' }, k);
  const sect = (titel, ...k) => h('section', null, h('h2', null, titel), k);
  const leer = t => h('p', { class: 'note' }, t);
  function vPill(v) {
    const cls = { aktiv: 'good', gekuendigt: 'warn', beendet: 'off', ersetzt: 'off' }[v.status] || '';
    return h('span', { class: 'pill ' + cls }, lab(VSTATUS, v.status));
  }
  function vRow(v) {
    const f = byId('firmen', v.firmaId);
    return h('button', { type: 'button', class: 'row', onclick: () => go({ name: 'detail', col: 'vertraege', id: v.id }) },
      h('span', { class: 'txt' }, h('span', { class: 't' }, v.kurzname), h('span', { class: 's' }, [f && f.name, L.rollenVon(v).join(', ')].filter(Boolean).join(' · '))),
      h('span', { class: 'r' }, v.beitrag ? eur(L.proMonat(L.standAm(v, S.fassungen, L.heute()))) + '/Monat' : '', v.status !== 'aktiv' && [h('br'), vPill(v)]));
  }
  function dRow(d) {
    return h('button', { type: 'button', class: 'row', onclick: () => go({ name: 'detail', col: 'dinge', id: d.id }) },
      h('span', { class: 'txt' }, h('span', { class: 't' }, d.name), h('span', { class: 's' }, [d.hersteller, d.modell, d.jahr].filter(Boolean).join(' · '))),
      d.status && d.status !== 'aktiv' && h('span', { class: 'pill off' }, d.status));
  }
  function bRow(b) {
    const f = byId('firmen', b.firmaId);
    return h('button', { type: 'button', class: 'row', onclick: () => go({ name: 'form', col: 'belege', id: b.id }) },
      h('span', { class: 'txt' }, h('span', { class: 't' }, b.titel), h('span', { class: 's' }, [L.fmt(b.datum), f && f.name, b.steuer && b.steuer !== '-' && lab(STEUER, b.steuer)].filter(Boolean).join(' · '))),
      h('span', { class: 'r' }, b.betrag ? eur(b.betrag) : ''));
  }
  function dokRow(d) {
    return h('button', { type: 'button', class: 'row', onclick: () => go({ name: 'detail', col: 'dokumente', id: d.id }) },
      h('span', { class: 'txt' }, h('span', { class: 't' }, d.titel || d.typ), h('span', { class: 's' }, [d.typ, d.datum && L.fmt(d.datum)].filter(Boolean).join(' · '))),
      d.gueltigBis && h('span', { class: 'r' }, 'bis ' + L.fmt(d.gueltigBis)));
  }
  const dokSect = (key, id) => { const ds = S.dokumente.filter(d => d[key] === id).sort((a, b) => (a.datum || '') < (b.datum || '') ? 1 : -1); return ds.length ? sect('Dokumente', card(ds.map(dokRow))) : null; };
  function fRow(f, tag) {
    const tage = f.datum ? L.diffDays(tag, f.datum) : null;
    const cls = f.erledigt ? '' : tage != null && tage < 0 ? 'crit' : (f.immer || (tage != null && tage <= 14)) ? 'warn' : '';
    const wann = f.erledigt ? 'erledigt' : tage == null ? '' : tage < 0 ? 'überfällig seit ' + (-tage) + (tage === -1 ? ' Tag' : ' Tagen') : tage === 0 ? 'heute' : 'in ' + tage + (tage === 1 ? ' Tag' : ' Tagen');
    const open = () => f.vertragId ? go({ name: 'detail', col: 'vertraege', id: f.vertragId }) : f.manuell ? go({ name: 'form', col: 'fristen', id: f.id }) : f.belegId ? go({ name: 'form', col: 'belege', id: f.belegId }) : null;
    return h('div', { class: 'row stripe ' + cls },
      h('button', { type: 'button', class: 'txt', style: 'border:0;background:none;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer', onclick: open },
        h('span', { class: 't' }, f.titel), h('span', { class: 's' }, [f.datum && L.fmt(f.datum), wann].filter(Boolean).join(' · '))),
      !f.erledigt && (!f.immer || f.quittierbar) && h('button', { type: 'button', class: 'btn small', onclick: () => erledigt(f) }, 'Erledigt'));
  }
  function timeline(key, id) {
    const ev = S.ereignisse.filter(e => e[key] === id).sort((a, b) => a.datum < b.datum ? 1 : -1);
    return sect('Zeitleiste', ev.length ? h('div', { class: 'card' }, h('ul', { class: 'tl' }, ev.map(e => h('li', null, h('time', null, L.fmt(e.datum)), e.text, e.dokumentId && byId('dokumente', e.dokumentId) && [' ', h('a', { href: '#', onclick: x => { x.preventDefault(); go({ name: 'detail', col: 'dokumente', id: e.dokumentId }); } }, 'Dokument')])))) : leer('Noch keine Ereignisse.'));
  }
  const kv = pairs => h('dl', { class: 'card kv' }, pairs.filter(p => p && p[1] != null && p[1] !== '' && !(Array.isArray(p[1]) && !p[1].length)).map(p => [h('dt', null, p[0]), h('dd', null, p[1])]));
  const web = u => { const w = L.webAdresse(u); return w && h('a', { href: w, target: '_blank', rel: 'noopener noreferrer' }, w.replace(/^https?:\/\//, '')); };
  const tel = n => n && h('a', { href: 'tel:' + String(n).replace(/[^\d+]/g, '') }, n);

  /* ---------- Ansichten ---------- */
  function home() {
    const tag = L.heute(), w = L.wichtig(S, tag, S.einst.vorlauf), fk = L.fixkosten(S.vertraege, S.fassungen, tag);
    const n = (col, fn) => S[col].filter(fn).length;
    const tiles = [
      ['Versicherungen', 'versicherungen', n('vertraege', v => L.istVers(v) && L.laeuft(v)) + ' laufend'],
      ['Verträge', 'vertraege', n('vertraege', v => !L.istVers(v) && L.laeuft(v)) + ' laufend'],
      ['Haus', 'haus', anz(n('dinge', d => d.kategorie === 'Haus'), 'Eintrag', 'Einträge')],
      ['Auto', 'auto', anz(n('dinge', d => d.kategorie === 'Auto'), 'Eintrag', 'Einträge')],
      ['Geräte', 'geraete', anz(n('dinge', d => d.kategorie === 'Gerät' || d.kategorie === 'Wertsache'), 'Eintrag', 'Einträge')],
    ].concat(L.ENUM.dingKat.filter(k => !L.BASIS.dingKat.includes(k)).map(k => [k, 'kat:' + k, anz(n('dinge', d => d.kategorie === k), 'Eintrag', 'Einträge')]), [
      ['Belege', 'belege', anz(S.belege.length, 'Beleg', 'Belege')],
      ['Dokumente', 'dokumente', anz(S.dokumente.length, 'Dokument', 'Dokumente')],
      ['Termine', 'termine', n('fristen', f => !f.abgeleitet && f.status !== 'erledigt') + ' offen'],
      ['Firmen', 'firmen', anz(S.firmen.length, 'Kontakt', 'Kontakte')],
      ['Zähler', 'zaehler', anz(S.zaehler.length, 'Zähler', 'Zähler')],
      ['Schadenfälle', 'schaeden', anz(n('schadenfaelle', x => x.status === 'offen' || x.status === 'gemeldet'), 'offener Fall', 'offene Fälle')],
    ]);
    const jahre = Array.from(new Set([tag.slice(0, 4)].concat(S.belege.filter(b => b.steuer && b.steuer !== '-' && b.datum).map(b => b.datum.slice(0, 4))))).sort().reverse();
    return [
      (() => {
        const inp = h('input', { id: 'frage', type: 'text', placeholder: 'Frag die Akte …', 'aria-label': 'Frage an die Akte', value: HA.q || '', oninput: e => { HA.q = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') HA.frageStarten(inp.value); } });
        return h('section', null,
          h('div', { class: 'ask' }, inp, HA.mikro && HA.mikro(inp), h('button', { type: 'button', class: 'btn small', onclick: () => HA.frageStarten(inp.value) }, 'Fragen'), h('button', { type: 'button', class: 'btn small', onclick: () => go({ name: 'suche', q: inp.value.trim() }) }, 'Suchen')),
          h('button', { type: 'button', class: 'btn primary big', onclick: () => go({ name: 'doc', files: [] }) }, '+ Dokument'),
          h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn', onclick: () => go({ name: 'neu' }) }, '+ Eintrag von Hand'), h('button', { type: 'button', class: 'btn', onclick: () => go({ name: 'leben' }) }, 'Lebensereignis')),
          h('button', { type: 'button', class: 'btn schaden', onclick: () => go({ name: 'schaden' }) }, 'Schadenfall'));
      })(),
      (() => { const kz = HA.kalenderZahl(), kal = kz.neu || kz.loeschen ? h('button', { type: 'button', class: 'row stripe' + (kz.loeschen ? ' warn' : ''), onclick: () => go({ name: 'kalender' }) },
          h('span', { class: 'txt' }, h('span', { class: 't' }, 'Kalender: ' + kz.neu + ' neu, ' + kz.loeschen + ' löschen'), h('span', { class: 's' }, kz.loeschen ? 'Veraltete Termine stehen noch in deinem Kalender.' : 'Termine als Kalenderdatei laden.'))) : null;
        const sst = HA.schwaerzStatus && HA.schwaerzStatus(), sl = sst ? h('button', { type: 'button', class: 'row stripe ' + sst.klasse, onclick: () => go({ name: 'schwaerz' }) },
          h('span', { class: 'txt' }, h('span', { class: 't' }, sst.titel), h('span', { class: 's' }, sst.text))) : null;
        return sect('Jetzt wichtig', w.length || kal || sl ? card(sl, w.map(f => fRow(f, tag)), kal) : leer('Nichts fällig in den nächsten ' + S.einst.vorlauf + ' Tagen.')); })(),
      (() => { const bef = L.jahresBefunde(S, tag).length, js = L.jahresStand(S, S.einst, tag.slice(0, 4)), dk = L.deckung(S, tag), kz = HA.kalenderZahl();
        const w = [['Deckung', 'deckung', dk.length + ' Policen' + (dk.some(x => !x.hatSteckbrief) ? ', ' + dk.filter(x => !x.hatSteckbrief).length + ' ohne Steckbrief' : '')], ['Notfallblatt', 'notfall', 'Hotlines als PDF'],
          ['Jahres-Check', 'jahrescheck', js.erledigt + ' von ' + js.gesamt + ' angesehen' + (bef ? ', ' + bef + ' Befunde' : '')], ['Kalender', 'kalender', kz.neu + ' neu, ' + kz.loeschen + ' löschen']];
        return sect('Werkzeuge', h('div', { class: 'tiles' }, w.map(t => h('button', { type: 'button', class: 'tile', onclick: () => go({ name: t[1] }) }, h('b', null, t[0]), h('span', null, t[2]))))); })(),
      sect('Bereiche', h('div', { class: 'tiles' }, tiles.map(t => h('button', { type: 'button', class: 'tile', onclick: () => go({ name: 'list', b: t[1] }) }, h('b', null, t[0]), h('span', null, t[2]))))),
      sect('Fixkosten', h('div', { class: 'card sum' }, h('div', null, h('b', null, eur(fk.monat)), h('span', null, 'pro Monat')), h('div', null, h('b', null, eur(fk.jahr)), h('span', null, 'pro Jahr')))),
      sect('§ 35a je Steuerjahr', jahre.map(j => {
        const s = L.steuer35a(S.belege, j);
        const z = (art, name) => h('div', { class: 'row' }, h('span', { class: 'txt' }, h('span', { class: 't' }, j + ' · ' + name),
          h('span', { class: 's' }, 'Arbeitskosten ' + eur(s[art].anrechenbar) + (s[art].bar ? ' · ' + s[art].bar + ' Beleg(e) bar bezahlt, nicht mitgezählt' : ''))),
          h('span', { class: 'r' }, '20 % = ' + eur(s[art].ermaessigung), h('br'), 'max. ' + eur(L.MAX35A[art])));
        return card(z('handwerker', 'Handwerker'), z('haushaltsnah', 'haushaltsnah'));
      }), h('p', { class: 'note' }, 'Rechnerische Summe aus den Belegen, keine Steuerberatung. Höchstbeträge [prüfen].')),
      h('button', { type: 'button', class: 'btn', onclick: () => go({ name: 'export' }) }, 'Alles exportieren'),
    ];
  }
  function neu() {
    return [card(Object.keys(SCHEMA).filter(col => !SCHEMA[col].nichtNeu).map(col => h('button', { type: 'button', class: 'row', onclick: () => { stack.pop(); go({ name: 'form', col }); } }, h('span', { class: 't' }, SCHEMA[col].ein))))];
  }
  const LISTEN = {
    versicherungen: { t: 'Versicherungen', col: 'vertraege', f: v => L.istVers(v), row: vRow, preset: { art: 'Versicherung' } },
    vertraege: { t: 'Verträge', col: 'vertraege', f: v => !L.istVers(v), row: vRow },
    haus: { t: 'Haus', col: 'dinge', f: d => d.kategorie === 'Haus', row: dRow, preset: { kategorie: 'Haus' } },
    auto: { t: 'Auto', col: 'dinge', f: d => d.kategorie === 'Auto', row: dRow, preset: { kategorie: 'Auto' } },
    geraete: { t: 'Geräte', col: 'dinge', f: d => d.kategorie === 'Gerät' || d.kategorie === 'Wertsache', row: dRow, preset: { kategorie: 'Gerät' } },
    dokumente: { t: 'Dokumente', col: 'dokumente', f: () => true, row: dokRow, sort: (a, b) => (a.datum || '') < (b.datum || '') ? 1 : -1, add: () => go({ name: 'doc', files: [] }) },
    zaehler: { t: 'Zähler', col: 'zaehler', f: () => true, row: z => { const a = L.ablesungen(z.staende)[0]; return h('button', { type: 'button', class: 'row', onclick: () => go({ name: 'detail', col: 'zaehler', id: z.id }) },
      h('span', { class: 'txt' }, h('span', { class: 't' }, z.name), h('span', { class: 's' }, [z.art, a ? 'zuletzt ' + L.fmt(a.datum) : 'noch keine Ablesung'].filter(Boolean).join(' · '))), a && h('span', { class: 'r' }, a.wert.toLocaleString('de-DE') + ' ' + (z.einheit || ''))); } },
    schaeden: { t: 'Schadenfälle', col: 'schadenfaelle', f: () => true, sort: (a, b) => a.datum < b.datum ? 1 : -1, add: () => go({ name: 'schaden' }), addName: 'Schadenfall',
      row: x => h('button', { type: 'button', class: 'row', onclick: () => go({ name: 'detail', col: 'schadenfaelle', id: x.id }) }, h('span', { class: 'txt' }, h('span', { class: 't' }, x.titel), h('span', { class: 's' }, (x.beschreibung || '').slice(0, 70))), h('span', { class: 'pill ' + (x.status === 'offen' ? 'warn' : '') }, x.status || 'offen')) },
    belege: { t: 'Belege', col: 'belege', f: () => true, row: bRow, sort: (a, b) => a.datum < b.datum ? 1 : -1 },
    firmen: { t: 'Firmen', col: 'firmen', f: () => true, row: f => h('button', { type: 'button', class: 'row', onclick: () => go({ name: 'detail', col: 'firmen', id: f.id }) }, h('span', { class: 'txt' }, h('span', { class: 't' }, f.name), h('span', { class: 's' }, f.art || ''))) },
  };
  const listDef = b => b.startsWith('kat:') ? { t: b.slice(4), col: 'dinge', f: d => d.kategorie === b.slice(4), row: dRow, preset: { kategorie: b.slice(4) } } : LISTEN[b];
  function list(v) {
    const tag = L.heute();
    if (v.b === 'termine') {
      const all = L.alleFristen(S);
      return [h('button', { type: 'button', class: 'btn', onclick: () => go({ name: 'form', col: 'fristen' }) }, '+ Termin'),
        sect('Offen', all.some(f => !f.erledigt) ? card(all.filter(f => !f.erledigt).map(f => fRow(f, tag))) : leer('Keine offenen Termine.')),
        all.some(f => f.erledigt) && sect('Erledigt', card(all.filter(f => f.erledigt).map(f => fRow(f, tag))))];
    }
    const d = listDef(v.b), items = S[d.col].filter(d.f).sort(d.sort || ((a, b) => nameOf(d.col, a).localeCompare(nameOf(d.col, b), 'de')));
    const alt = x => d.col === 'vertraege' ? !L.laeuft(x) && x.status !== 'angebot' : d.col === 'dinge' ? x.status && x.status !== 'aktiv' : false;
    const akt = items.filter(x => !alt(x)), al = items.filter(alt);
    return [h('button', { type: 'button', class: 'btn', onclick: d.add || (() => go({ name: 'form', col: d.col, preset: d.preset })) }, '+ ' + (d.addName || (d.add ? 'Dokument' : SCHEMA[d.col].ein))),
      akt.length ? card(akt.map(d.row)) : leer('Noch nichts eingetragen.'),
      al.length && sect('Früher', card(al.map(d.row)))];
  }
  function detail(v) {
    const r = byId(v.col, v.id), tag = L.heute();
    if (!r) return [leer('Dieser Eintrag ist nicht mehr vorhanden.')];
    if (v.col === 'dokumente') return HA.dokDetail(v, r);
    if (v.col === 'schadenfaelle') return HA.schadenDetail(v, r);
    if (v.col === 'zaehler') return HA.zaehlerDetail(v, r);
    const edit = h('button', { type: 'button', class: 'btn', onclick: () => go({ name: 'form', col: v.col, id: v.id }) }, 'Bearbeiten');
    const fr = key => { const fs = L.alleFristen(S).filter(f => f[key] === v.id); return fs.length ? sect('Termine und Fristen', card(fs.map(f => fRow(f, tag)))) : null; };
    if (v.col === 'vertraege') {
      const fa = byId('firmen', r.firmaId), ers = byId('vertraege', r.ersetztDurchId);
      const kj = L.kuendigungJetzt(r, tag);
      const ex = HA.vertragExtra(r), jetzt = L.standAm(r, S.fassungen, tag);
      return [h('div', { class: 'btnrow' }, vPill(r), h('span', { class: 'pill' }, r.art)), h('div', { class: 'btnrow' }, ex.knoepfe),
        kj && h('div', { class: 'card box' + (kj.art === 'unklar' ? ' warn' : '') },
          h('b', null, kj.art === 'termin' ? 'Kündigen bis ' + L.fmt(kj.bis) : kj.art === 'jederzeit' ? 'Jederzeit kündbar' + (kj.zum ? ': Vertragsende frühestens ' + L.fmt(kj.zum) : '') : 'Kündigungsfrist verstrichen'),
          h('span', null, kj.text),
          kj.hinweis ? h('span', { class: 'note' }, kj.hinweis) : null,
          kj.art === 'jederzeit' && kj.erstlaufzeitEnde ? h('span', { class: 'note' }, 'Die Erstlaufzeit endete am ' + L.fmt(kj.erstlaufzeitEnde) + '. Seitdem läuft der Vertrag unbefristet.') : null,
          h('span', { class: 'note' }, 'Im Zweifel gilt die Frist im Vertrag. Der Zugang beim Anbieter zählt.')),
        kv([['Firma', fa && h('a', { href: '#', onclick: e => { e.preventDefault(); go({ name: 'detail', col: 'firmen', id: fa.id }); } }, fa.name)],
          ['Hotline', fa && tel(fa.hotline)], ['Für wen', L.rollenVon(r).join(', ')],
          ['Bezug', L.dingeVon(r).map(id => byId('dinge', id)).filter(Boolean).flatMap((x, i) => [i ? ', ' : '', h('a', { href: '#', onclick: e => { e.preventDefault(); go({ name: 'detail', col: 'dinge', id: x.id }); } }, x.name)])],
          ['Beitrag', jetzt.beitrag ? eur(jetzt.beitrag) + ' ' + lab(ZAHLWEISE, jetzt.zahlweise) + ' = ' + eur(L.proMonat(jetzt)) + '/Monat' + (jetzt.beitrag !== r.beitrag ? ' (ab neuer Fassung: ' + eur(L.proMonat(r)) + '/Monat)' : '') : null],
          ['Abschluss', r.abschluss && L.fmt(r.abschluss)], ['Beginn', r.beginn && L.fmt(r.beginn)], ['Laufzeitende', r.laufzeitende ? L.fmt(r.laufzeitende) + (kj && kj.art === 'jederzeit' ? ' (Erstlaufzeit, vorbei)' : kj && kj.verpasst ? ' (vorbei)' : '') : r.erstlaufzeitEnde ? 'unbefristet (Erstlaufzeit bis ' + L.fmt(r.erstlaufzeitEnde) + ')' : 'unbefristet'],
          ['Kündigungsfrist', r.fristWert ? einh(r.fristWert, r.fristEinheit) : null], ['Verlängerung', lab(VERL, r.verlaengerung)],
          ['Kündigungsweg', r.kuendigungsweg], ['Online abgeschlossen', r.online ? 'ja' : null],
          ['Kündigung versendet', r.gekuendigtAm && L.fmt(r.gekuendigtAm)], ['Gekündigt zum', r.gekuendigtZum && L.fmt(r.gekuendigtZum)],
          ['Bestätigung', r.status === 'gekuendigt' ? (r.bestaetigt ? 'liegt vor' : 'fehlt noch') : null],
          ['Ersetzt durch', ers && ers.kurzname], ['Web', web(r.web)], ['Notiz', r.notiz]]),
        fr('vertragId'), ex.fassungen, dokSect('vertragId', v.id), timeline('vertragId', v.id), edit];
    }
    if (v.col === 'dinge') {
      const vs = S.vertraege.filter(x => L.dingeVon(x).includes(v.id)), bs = S.belege.filter(b => b.dingId === v.id);
      return [kv([['Bereich', r.kategorie], ['Hersteller', r.hersteller], ['Modell', r.modell], ['Kauf-/Baujahr', r.jahr], ['Status', r.status], ['Notiz', r.notiz]]),
        sect('Verträge', vs.length ? card(vs.map(vRow)) : leer('Keine Verträge verknüpft.')),
        sect('Belege', bs.length ? card(bs.map(bRow)) : leer('Keine Belege verknüpft.')),
        fr('dingId'), dokSect('dingId', v.id), timeline('dingId', v.id),
        h('div', { class: 'btnrow' }, edit, h('button', { type: 'button', class: 'btn', onclick: () => go({ name: 'form', col: 'belege', preset: { dingId: v.id } }) }, '+ Beleg'),
          h('button', { type: 'button', class: 'btn', onclick: () => go({ name: 'form', col: 'fristen', preset: { dingId: v.id } }) }, '+ Termin'))];
    }
    const vs = S.vertraege.filter(x => x.firmaId === v.id), bs = S.belege.filter(b => b.firmaId === v.id);
    return [kv([['Art', r.art], ['Telefon', tel(r.telefon)], ['E-Mail', r.email && h('a', { href: 'mailto:' + r.email }, r.email)], ['Hotline', tel(r.hotline)], ['Web', web(r.web)], ['Notiz', r.notiz]]),
      sect('Verträge', vs.length ? card(vs.map(vRow)) : leer('Keine Verträge.')), sect('Belege', bs.length ? card(bs.map(bRow)) : leer('Keine Belege.')), dokSect('firmaId', v.id), edit];
  }
  function settings() {
    const inp = h('input', { id: 'vorlauf', type: 'text', inputmode: 'numeric', value: S.einst.vorlauf });
    const zeile = (name, text, ziel) => h('button', { type: 'button', class: 'row', onclick: () => go({ name: ziel }) }, h('span', { class: 'txt' }, h('span', { class: 't' }, name), h('span', { class: 's' }, text)));
    const weg = COLS.reduce((n, c) => n + (S.weg[c] || []).length, 0);
    return [h('form', { onsubmit: async e => { e.preventDefault(); const n = parseInt(inp.value, 10);
      if (!(n >= 1 && n <= 365)) return toast('Bitte eine Zahl von 1 bis 365 eingeben.');
      try { await db.doc('einstellungen/haushalt').set(Object.assign({}, S.einst, { vorlauf: n })); toast('Gespeichert'); } catch (x) { toast('Speichern hat nicht geklappt.'); } } },
      h('div', { class: 'field' }, h('label', { for: 'vorlauf' }, 'Vorlauf für „Jetzt wichtig“ in Tagen'), inp, h('span', { class: 'hint' }, 'Standard: 42 Tage (6 Wochen).')),
      h('button', { type: 'submit', class: 'btn primary' }, 'Vorlauf speichern')),
      card(zeile('Eigene Auswahlwerte', 'Arten, Bereiche, Rollen, Dokumenttypen', 'eigene'), zeile('Lebensereignisse', 'eigene anlegen, eingebaute ausblenden', 'lebenEdit'),
        zeile('Texte', 'Sofortmaßnahmen und Kündigungsentwurf', 'texte'), zeile('Schwärzliste', 'Namen und Anschrift, verschlüsselt mit Passwort', 'schwaerz'),
        zeile('Gespeicherte Originale', (n => n ? n + (n === 1 ? ' Dokument mit Original' : ' Dokumente mit Original') : 'keine')(S.dokumente.concat(S.weg.dokumente || []).filter(d => (d.dateien || []).length).length), 'originale'),
        zeile('Verworfene Einträge', weg ? weg + ' verworfen' : 'keine', 'verworfen'), zeile('Export und Sicherung', 'Excel, Markdown, Datensicherung, Import', 'export'))];
  }
  HA.views.verworfen = { title: 'Verworfene Einträge', body: () => {
    const namen = { firmen: 'Firmen', dinge: 'Dinge', vertraege: 'Verträge', belege: 'Belege', fristen: 'Termine', dokumente: 'Dokumente', schadenfaelle: 'Schadenfälle' };
    const teile = Object.keys(namen).filter(c => (S.weg[c] || []).length).map(c => sect(namen[c], card(S.weg[c].map(x => h('div', { class: 'row' },
      h('span', { class: 'txt' }, h('span', { class: 't' }, nameOf(c, x)), h('span', { class: 's' }, 'verworfen am ' + L.fmt(x.verworfenAm))),
      h('button', { type: 'button', class: 'btn small', onclick: async e => { e.currentTarget.disabled = true; const d = Object.assign({}, x); delete d.id; delete d.verworfen; delete d.verworfenAm;
        try { await db.doc(c + '/' + x.id).set(d); toast('Wiederhergestellt'); } catch (er) { toast('Hat nicht geklappt.'); } setTimeout(HA.rerender, 150); } }, 'Wiederherstellen'))))));
    return teile.length ? [h('p', { class: 'note' }, 'Verworfene Einträge zählen nirgends mit, sind aber in der Datensicherung enthalten.')].concat(teile) : [leer('Es gibt keine verworfenen Einträge.')];
  } };

  function render() {
    const v = view(), ext = HA.views[v.name], isForm = v.name === 'form' || v.name === 'settings' || !!ext;
    if (isForm && mountedForm === v) return; /* offenes Formular nicht durch Live-Daten überschreiben */
    $('back').hidden = stack.length < 2; $('gear').hidden = v.name !== 'home';
    let title = 'Haushalt', body;
    if (!ready) body = [leer(problem || 'Daten werden geladen …')];
    else if (!db) body = [leer(problem)];
    else if (v.name === 'home') body = home();
    else if (v.name === 'neu') { title = 'Neuer Eintrag'; body = neu(); }
    else if (v.name === 'list') { title = v.b === 'termine' ? 'Termine' : listDef(v.b).t; body = list(v); }
    else if (v.name === 'detail') { title = nameOf(v.col, byId(v.col, v.id)); body = detail(v); }
    else if (ext) { title = ext.title; body = ext.body(v); mountedForm = v; }
    else if (v.name === 'form') { title = (v.id ? '' : 'Neu: ') + SCHEMA[v.col].ein; body = formView(v); mountedForm = v; }
    else { title = 'Einstellungen'; body = settings(); mountedForm = v; }
    if (ready && db && problem) body.unshift(leer(problem));
    $('title').textContent = title;
    $('main').replaceChildren(...body.flat(Infinity).filter(Boolean));
  }

  async function start() {
    $('back').addEventListener('click', back);
    $('gear').addEventListener('click', () => go({ name: 'settings' }));
    render();
    try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (!db) { ready = true; problem = 'Die Datenablage ist in dieser Ansicht nicht erreichbar. Öffne die App angemeldet direkt in Claude.'; return render(); }
    const timer = setTimeout(() => { if (!ready) { problem = 'Die Daten sind noch nicht erreichbar. Die App versucht es weiter.'; render(); } }, 10000);
    const pending = new Set(COLS);
    COLS.forEach(col => db.collection(col).onSnapshot(snap => {
      const alle = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      S[col] = alle.filter(x => !x.verworfen); S.weg[col] = alle.filter(x => x.verworfen);
      pending.delete(col);
      if (!pending.size) { ready = true; problem = ''; clearTimeout(timer); }
      if (ready && !(snap.metadata && snap.metadata.fromCache)) setTimeout(() => HA.wartung && HA.wartung(), 1500);
      render();
    }, e => { ready = true; clearTimeout(timer); problem = 'Daten konnten nicht geladen werden (' + e.code + ').'; render(); }));
    db.doc('einstellungen/haushalt').onSnapshot(s => { if (s.exists) { S.einst = Object.assign({ vorlauf: 42 }, s.data()); L.setEigene(S.einst.eigene); render(); } }, () => {});
  }
  Object.assign(HA, { h, $, toast, hinweis, abschliessen, verwerfenKnopf, COLS, go, back, byId, eur, SCHEMA, fieldEl, readFields, nameOf, card, sect, leer, kv, lab, db: () => db,
    rerender: () => { mountedForm = null; render(); }, pop: () => { mountedForm = null; stack.pop(); }, push: v => stack.push(v) });
  /* erst starten, wenn alle Teile der App geladen sind (ask.js, exp.js usw. hängen sich an HA an) */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* Schwärzer: Fotos und PDFs schwärzen, mit eigener Liste und frei wählbaren Beschriftungen. Nichts geht an Claude. */
(function () {
  'use strict';
  const L = window.HL, SU = window.SU, $ = id => document.getElementById(id);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v); }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  let toastT; const toast = (t, lang) => { const e = $('toast'); e.replaceChildren(h('span', null, t)); if (lang) e.append(h('br'), h('button', { type: 'button', class: 'btn small', style: 'margin-top:8px', onclick: () => { e.hidden = true; } }, 'Schließen')); e.hidden = false; clearTimeout(toastT); if (!lang) toastT = setTimeout(() => { e.hidden = true; }, 2600); };
  const A = { tab: 'schwaerzen', seiten: [], name: '', status: '', opt: { iban: true, ziffern: true, beschriften: true }, ocr: null, aktiv: -1 };
  const STANDARD = ['[Name]', '[Adresse]', '[Nummer]', '[IBAN]', '[Telefon]', '[E-Mail]', '[Geburtsdatum]'];

  /* ---------- Liste: verschlüsselt in der Datenbank, sonst nur im Browser ---------- */
  const LS = 'schwaerzer_liste', KDOC = 'liste/haupt';
  const SL = { zustand: 'laden', box: null, key: null, mem: [] };
  let db = null;
  const lokal = () => { try { const l = JSON.parse(localStorage.getItem(LS)); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  const liste = () => SL.zustand === 'offen' ? SL.mem.slice() : SL.zustand === 'gesperrt' ? [] : lokal();
  const idb = () => new Promise((ok, no) => { try { const r = indexedDB.open('schwaerzer', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } });
  async function keyHolen(salz) { try { const d = await idb(); return await new Promise(ok => { const t = d.transaction('k').objectStore('k').get('liste'); t.onsuccess = () => ok(t.result && t.result.salz === salz ? t.result.key : null); t.onerror = () => ok(null); }); } catch (e) { return null; } }
  async function keyMerken(key, salz) { try { const d = await idb(); await new Promise(ok => { const t = d.transaction('k', 'readwrite'); t.objectStore('k').put({ key, salz }, 'liste'); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* ohne Merken weiter */ } }
  async function keyVergessen() { try { const d = await idb(); d.transaction('k', 'readwrite').objectStore('k').delete('liste'); } catch (e) { /* nichts gemerkt */ } }
  async function boxSchreiben(l) { const enc = await L.verschluesseln(SL.key, { liste: l }); const d = { v: 1, salz: SL.box.salz, iter: SL.box.iter, iv: enc.iv, daten: enc.daten }; await db.doc(KDOC).set(d); SL.box = d; }
  async function boxNeu(box) {
    SL.box = box;
    if (!box) { SL.zustand = 'keine'; SL.key = null; SL.mem = []; return render(); }
    const key = SL.key && SL.keySalz === box.salz ? SL.key : await keyHolen(box.salz);
    if (key) { try { SL.mem = (await L.entschluesseln(key, box)).liste || []; SL.key = key; SL.keySalz = box.salz; SL.zustand = 'offen'; return render(); } catch (e) { /* anderes Passwort */ } }
    SL.key = null; SL.mem = []; SL.zustand = 'gesperrt'; render();
  }
  function setListe(l) {
    if (SL.zustand === 'gesperrt' || SL.zustand === 'laden') { toast('Die Liste ist gesperrt. Bitte zuerst das Passwort eingeben.'); return false; }
    if (SL.zustand === 'offen') { SL.mem = l.slice(); boxSchreiben(l).catch(() => toast('Die Liste konnte nicht gespeichert werden.', true)); }
    else { try { localStorage.setItem(LS, JSON.stringify(l)); } catch (e) { toast('Speichern ist in diesem Browser nicht möglich.'); return false; } }
    return true;
  }

  /* ---------- Dateien laden ---------- */
  let pdfLib;
  const pdfjs = () => pdfLib || (pdfLib = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'pdf.min.js'; s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; ok(window.pdfjsLib); }; s.onerror = () => { pdfLib = null; no(new Error('PDF-Baustein nicht geladen')); }; document.head.append(s); }));
  const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
  async function bildLaden(file) {
    let src; try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { src = await new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('Bild nicht lesbar')); }; i.src = u; }); }
    const k = Math.min(1, 2400 / Math.max(src.width, src.height)), c = document.createElement('canvas');
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  async function laden(files) {
    const pdf = files.find(isPdf); if (pdf && files.length > 1) return toast('Bitte entweder ein PDF oder Fotos wählen.');
    A.seiten = []; A.name = (files[0].name || 'Dokument').replace(/\.[^.]+$/, ''); A.aktiv = 0; status('Wird geladen …'); render();
    try {
      if (pdf) {
        const lib = await pdfjs(), doc = await lib.getDocument({ data: await pdf.arrayBuffer() }).promise;
        if (doc.numPages > 60) throw new Error('Mehr als 60 Seiten. Bitte in Teilen bearbeiten.');
        for (let i = 1; i <= doc.numPages; i++) {
          status('Seite ' + i + ' von ' + doc.numPages + ' wird vorbereitet …');
          const page = await doc.getPage(i), vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(3, 1700 / vp0.width) });
          const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          const tc = await page.getTextContent(), stuecke = [];
          for (const it of tc.items) { if (!it.str) continue; const hgt = it.height || Math.hypot(it.transform[2], it.transform[3]) || 10;
            const r = vp.convertToViewportRectangle([it.transform[4], it.transform[5] - hgt * 0.22, it.transform[4] + it.width, it.transform[5] + hgt * 0.92]);
            stuecke.push({ str: it.str, x0: Math.min(r[0], r[2]), x1: Math.max(r[0], r[2]), y0: Math.min(r[1], r[3]), y1: Math.max(r[1], r[3]) }); }
          A.seiten.push({ c, stuecke, text: stuecke.length > 3, boxen: [] });
        }
      } else for (let i = 0; i < files.length; i++) { status('Foto ' + (i + 1) + ' von ' + files.length + ' wird vorbereitet …'); A.seiten.push({ c: await bildLaden(files[i]), stuecke: null, text: false, boxen: [] }); }
      automatisch(false);
      status('');
    } catch (e) { A.seiten = []; status(''); toast('Die Datei konnte nicht geöffnet werden: ' + (e && e.message || e), true); }
    render();
  }
  const status = t => { A.status = t; const e = $('status'); if (e) { e.textContent = t; e.hidden = !t; } };

  /* ---------- Automatische Fundstellen ---------- */
  function automatisch(meldung) {
    let n = 0;
    for (const s of A.seiten) { if (!s.stuecke) continue; s.boxen = s.boxen.filter(b => !b.auto).concat(SU.balkenFuer(s.stuecke, liste(), A.opt)); n += s.boxen.filter(b => b.auto).length; }
    if (meldung) toast(n + (n === 1 ? ' Stelle' : ' Stellen') + ' automatisch geschwärzt. Bitte prüfen.');
    return n;
  }
  /* Texterkennung für Fotos und Scans: läuft auf dem Gerät, nichts geht nach außen außer dem Laden der Engine. */
  const CDN = 'https://cdn.jsdelivr.net/npm/', TV = '5.1.1';
  const skript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Laden blockiert')); document.head.append(s); });
  async function ocrStarten() {
    if (A.ocr) return A.ocr;
    status('Texterkennung wird geladen …');
    await skript(CDN + 'tesseract.js@' + TV + '/dist/tesseract.min.js'); await skript('deu-daten.js');
    const bin = atob(window.DEU_TRAINEDDATA_B64), d = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) d[i] = bin.charCodeAt(i);
    A.ocr = await window.Tesseract.createWorker([{ code: 'deu', data: d }], 1, { workerPath: new URL('tesseract-worker.js', location.href).href, corePath: CDN + 'tesseract.js-core@' + TV, cacheMethod: 'none' });
    return A.ocr;
  }
  async function erkennen(knopf) {
    knopf.disabled = true;
    try {
      const w = await ocrStarten(), offen = A.seiten.filter(s => !s.stuecke);
      for (let i = 0; i < offen.length; i++) {
        status('Texterkennung: Seite ' + (A.seiten.indexOf(offen[i]) + 1) + ' (' + (i + 1) + ' von ' + offen.length + ') …');
        const r = await w.recognize(offen[i].c, {}, { blocks: true });
        const woerter = (r.data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
        offen[i].stuecke = woerter.map(x => ({ str: x.text, x0: x.bbox.x0, x1: x.bbox.x1, y0: x.bbox.y0, y1: x.bbox.y1 }));
      }
      status(''); automatisch(true);
    } catch (e) { status(''); toast('Die Texterkennung läuft hier nicht (' + (e && e.message || e) + '). Bitte von Hand schwärzen.', true); knopf.disabled = false; }
    render();
  }

  /* ---------- Zeichnen ---------- */
  function balken(g, r, k, mitText) {
    const x = r.x * k, y = r.y * k, w = r.w * k, hh = r.h * k;
    g.fillStyle = '#000'; g.fillRect(x, y, w, hh);
    if (!mitText || !r.label || w < 8 || hh < 6) return;
    let gr = hh * 0.72; g.font = 'bold ' + gr + 'px sans-serif';
    const tw = g.measureText(r.label).width; if (tw > w * 0.94) { gr *= w * 0.94 / tw; g.font = 'bold ' + gr + 'px sans-serif'; }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r.label, x + w / 2, y + hh / 2);
  }
  function labels() {
    const out = [['', 'ohne Beschriftung']], da = new Set(['']);
    for (const x of liste()) if (!da.has(x.label)) { da.add(x.label); out.push([x.label, x.label + ' · ' + x.text]); }
    for (const x of STANDARD) if (!da.has(x)) { da.add(x); out.push([x, x]); }
    return out;
  }
  function labelWahl(id, wert, onchange) {
    const inp = h('input', { id: id + '_eigen', type: 'text', maxlength: 30, placeholder: 'z. B. Opa, Ferienhaus, [Kontakt]', value: wert && !labels().some(o => o[0] === wert) ? wert : '' });
    const istEigen = !!inp.value, sub = h('div', { class: 'sub', hidden: !istEigen }, inp);
    const sel = h('select', { id, onchange: () => { sub.hidden = sel.value !== '__eigen'; if (!sub.hidden) inp.focus(); else onchange(sel.value); } },
      labels().map(o => h('option', { value: o[0], selected: !istEigen && o[0] === wert }, o[1])), h('option', { value: '__eigen', selected: istEigen }, '+ Eigene Beschriftung …'));
    inp.addEventListener('input', () => onchange(inp.value.trim().slice(0, 30)));
    return h('div', { class: 'stapel', style: 'gap:8px' }, sel, sub);
  }
  function editor(i) {
    const s = A.seiten[i], src = s.c, e = s.ed = s.ed || { an: true, gross: false, label: '' };
    const cv = h('canvas', { class: 'bild' + (e.an ? ' zeichnen' : ''), 'aria-label': 'Seite ' + (i + 1) + ': Rechtecke zum Schwärzen ziehen' }), wrap = h('div', { class: 'rahmen' }, cv), info = h('span', { class: 'note' });
    const zeichne = extra => {
      const w = Math.max(200, Math.round((wrap.clientWidth || 340) * (e.gross ? 2 : 1))), dpr = window.devicePixelRatio || 1;
      cv.style.width = w + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(cv.width * src.height / src.width);
      const g = cv.getContext('2d'), k = cv.width / src.width; g.drawImage(src, 0, 0, cv.width, cv.height);
      for (const r of extra ? s.boxen.concat([extra]) : s.boxen) balken(g, r, k, A.opt.beschriften);
      const a = s.boxen.filter(b => b.auto).length; info.textContent = s.boxen.length ? s.boxen.length + (s.boxen.length === 1 ? ' Stelle' : ' Stellen') + ' geschwärzt' + (a ? ', davon ' + a + ' automatisch' : '') : 'Noch nichts geschwärzt';
    };
    let start = null;
    const punkt = ev => { const r = cv.getBoundingClientRect(), k = src.width / r.width; return { x: Math.max(0, Math.min(src.width, (ev.clientX - r.left) * k)), y: Math.max(0, Math.min(src.height, (ev.clientY - r.top) * k)) }; };
    const rechteck = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
    cv.addEventListener('pointerdown', ev => { if (!e.an) return; ev.preventDefault(); cv.setPointerCapture(ev.pointerId); start = punkt(ev); });
    cv.addEventListener('pointermove', ev => { if (!start) return; ev.preventDefault(); zeichne(Object.assign(rechteck(start, punkt(ev)), { label: e.label })); });
    cv.addEventListener('pointerup', ev => { if (!start) return; const r = rechteck(start, punkt(ev)); start = null;
      if (r.w > src.width / 100 && r.h > src.height / 200) s.boxen.push(Object.assign(r, { label: e.label }));
      else { /* kurzes Antippen: Balken an dieser Stelle entfernen */ const p = r, j = s.boxen.map((b, n) => [b, n]).reverse().find(([b]) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h); if (j) s.boxen.splice(j[1], 1); }
      zeichne(); });
    cv.addEventListener('pointercancel', () => { start = null; zeichne(); });
    setTimeout(zeichne, 0);
    const knopf = (t, f) => h('button', { type: 'button', class: 'btn small', onclick: f }, t);
    return h('div', { class: 'card' },
      h('div', { class: 'kopf' }, h('b', null, 'Seite ' + (i + 1) + ' von ' + A.seiten.length), A.seiten.length > 1 ? h('div', { class: 'btnrow' }, knopf('‹ Zurück', () => { A.aktiv = Math.max(0, i - 1); render(); }), knopf('Weiter ›', () => { A.aktiv = Math.min(A.seiten.length - 1, i + 1); render(); })) : null),
      h('div', { class: 'field' }, h('label', { for: 'bl_' + i }, 'Beschriftung für neue Balken'), labelWahl('bl_' + i, e.label, w => { e.label = w; })),
      wrap, info,
      h('div', { class: 'btnrow' },
        knopf(e.an ? 'Zeichnen aus (blättern)' : 'Zeichnen an', () => { e.an = !e.an; render(); }),
        knopf(e.gross ? 'Kleiner' : 'Größer', () => { e.gross = !e.gross; render(); }),
        s.boxen.length ? knopf('Letztes entfernen', () => { s.boxen.pop(); zeichne(); }) : null,
        s.boxen.length ? knopf('Alle entfernen', () => { s.boxen = []; zeichne(); }) : null),
      h('p', { class: 'note' }, 'Ziehen: neuer Balken. Kurz auf einen Balken tippen: Balken entfernen.'));
  }

  /* ---------- Speichern ---------- */
  function flach(s) { const c = document.createElement('canvas'); c.width = s.c.width; c.height = s.c.height; const g = c.getContext('2d'); g.drawImage(s.c, 0, 0); for (const r of s.boxen) balken(g, r, 1, A.opt.beschriften); return c; }
  const blob = (c, q) => new Promise(ok => c.toBlob(ok, 'image/jpeg', q));
  async function speichern(dateiname, daten) { const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; if (!dl) throw new Error('Downloads sind in dieser Ansicht nicht verfügbar'); return dl.save({ filename: dateiname, data: daten }); }
  async function alsPdf(knopf) {
    knopf.disabled = true;
    try {
      if (!window.jspdf) await skript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      let doc = null;
      for (let i = 0; i < A.seiten.length; i++) {
        status('PDF wird erstellt: Seite ' + (i + 1) + ' von ' + A.seiten.length + ' …');
        const c = flach(A.seiten[i]), hoch = c.height >= c.width, w = hoch ? 210 : 297, hh = Math.min(hoch ? 297 : 210, w * c.height / c.width), ww = hh * c.width / c.height;
        if (!doc) doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: hoch ? 'p' : 'l' }); else doc.addPage('a4', hoch ? 'p' : 'l');
        doc.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', (w - ww) / 2, ((hoch ? 297 : 210) - hh) / 2, ww, hh);
      }
      status(''); await speichern(A.name + '-geschwaerzt.pdf', doc.output('arraybuffer')); toast('PDF gespeichert');
    } catch (e) { status(''); toast(e && e.code === 'declined' ? 'Download abgebrochen.' : 'Speichern hat nicht geklappt: ' + (e && (e.message || e.code) || e), true); }
    knopf.disabled = false;
  }
  async function alsBild(i, knopf) {
    knopf.disabled = true;
    try { await speichern(A.name + (A.seiten.length > 1 ? '-seite-' + (i + 1) : '') + '-geschwaerzt.jpg', await blob(flach(A.seiten[i]), 0.9)); toast('Bild gespeichert'); }
    catch (e) { toast(e && e.code === 'declined' ? 'Download abgebrochen.' : 'Speichern hat nicht geklappt: ' + (e && (e.message || e.code) || e), true); }
    knopf.disabled = false;
  }

  /* ---------- Ansichten ---------- */
  const check = (id, an, text, f) => h('div', { class: 'field check' }, h('input', { id, type: 'checkbox', checked: an, onchange: ev => f(ev.target.checked) }), h('label', { for: id }, text));
  function schwaerzenAnsicht() {
    const gesperrt = SL.zustand === 'gesperrt';
    if (!A.seiten.length) return [
      h('p', { class: 'note' }, 'Foto, mehrere Fotos oder ein PDF wählen. Alles bleibt auf deinem Gerät. Nichts geht an Claude.'),
      gesperrt ? h('div', { class: 'card warn' }, h('b', null, 'Liste gesperrt'), h('span', null, 'Ohne Entsperren werden keine Einträge automatisch gefunden.'), h('button', { type: 'button', class: 'btn small', onclick: () => { A.tab = 'liste'; render(); } }, 'Zur Liste')) : null,
      h('label', { class: 'btn primary big', for: 'datei' }, 'Foto oder PDF wählen'),
      h('input', { id: 'datei', type: 'file', multiple: true, accept: 'image/*,application/pdf', class: 'vh', onchange: ev => { const f = Array.from(ev.target.files || []); if (f.length) laden(f); ev.target.value = ''; } }),
      h('p', { class: 'note' }, liste().length + (liste().length === 1 ? ' Eintrag' : ' Einträge') + ' in deiner Liste.')];
    const s = A.seiten[A.aktiv] || A.seiten[0], ohneText = A.seiten.filter(x => !x.stuecke).length;
    return [
      h('div', { class: 'card' },
        h('b', null, A.name + ' · ' + A.seiten.length + (A.seiten.length === 1 ? ' Seite' : ' Seiten')),
        check('o_iban', A.opt.iban, 'IBAN automatisch schwärzen', v => { A.opt.iban = v; automatisch(false); render(); }),
        check('o_zif', A.opt.ziffern, 'Zahlen ab 5 Ziffern automatisch schwärzen (Nummern, Telefon)', v => { A.opt.ziffern = v; automatisch(false); render(); }),
        check('o_txt', A.opt.beschriften, 'Beschriftung in die Balken schreiben', v => { A.opt.beschriften = v; render(); }),
        ohneText ? h('div', { class: 'stapel', style: 'gap:6px' }, h('span', { class: 'note' }, (ohneText === A.seiten.length ? 'Kein lesbarer Text im Dokument (Foto oder Scan).' : ohneText + ' Seiten ohne lesbaren Text.') + ' Die Texterkennung sucht die Einträge deiner Liste im Bild. Sie läuft auf dem Gerät und braucht beim ersten Mal etwas Zeit.'),
          h('button', { type: 'button', class: 'btn', onclick: ev => erkennen(ev.currentTarget) }, 'Automatisch suchen (Texterkennung)')) : h('span', { class: 'note' }, 'Einträge deiner Liste wurden im Text des PDFs gesucht und geschwärzt.'),
        h('p', { class: 'note', id: 'status', hidden: !A.status }, A.status)),
      editor(A.seiten.indexOf(s)),
      h('div', { class: 'card' }, h('b', null, 'Speichern'),
        h('span', { class: 'note' }, 'Gespeichert werden nur Bilder der Seiten mit den Balken. Unter den Balken bleibt nichts lesbar, auch kein versteckter Text.'),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', onclick: ev => alsPdf(ev.currentTarget) }, 'Als PDF speichern'), h('button', { type: 'button', class: 'btn', onclick: ev => alsBild(A.seiten.indexOf(s), ev.currentTarget) }, A.seiten.length > 1 ? 'Diese Seite als Bild' : 'Als Bild speichern')),
        h('button', { type: 'button', class: 'btn', onclick: () => { A.seiten = []; render(); } }, 'Neues Dokument'))];
  }
  function sperrForm() {
    const pw = h('input', { id: 'sp_pw', type: 'password', autocomplete: 'current-password' }), merk = h('input', { id: 'sp_merk', type: 'checkbox', checked: true }), err = h('p', { class: 'err', hidden: true });
    return h('form', { novalidate: true, onsubmit: async ev => { ev.preventDefault(); err.hidden = true;
      try { const key = await L.schluesselAus(pw.value, SL.box.salz, SL.box.iter); SL.mem = (await L.entschluesseln(key, SL.box)).liste || []; SL.key = key; SL.keySalz = SL.box.salz; SL.zustand = 'offen'; if (merk.checked) await keyMerken(key, SL.box.salz); automatisch(false); render(); }
      catch (x) { err.textContent = x && x.code === 'passwort' ? 'Das Passwort stimmt nicht.' : 'Entsperren hat nicht geklappt.'; err.hidden = false; } } },
      h('div', { class: 'field' }, h('label', { for: 'sp_pw' }, 'Passwort der Liste'), pw), h('div', { class: 'field check' }, merk, h('label', { for: 'sp_merk' }, 'Auf diesem Gerät merken')), err, h('button', { type: 'submit', class: 'btn primary' }, 'Entsperren'));
  }
  function pwForm(aendern) {
    const p1 = h('input', { id: 'pw_1', type: 'password', autocomplete: 'new-password' }), p2 = h('input', { id: 'pw_2', type: 'password', autocomplete: 'new-password' }), err = h('p', { class: 'err', hidden: true });
    return h('form', { novalidate: true, onsubmit: async ev => { ev.preventDefault(); err.hidden = true;
      if (p1.value.length < 10) { err.textContent = 'Bitte mindestens 10 Zeichen, zum Beispiel vier zufällige Wörter.'; err.hidden = false; return; }
      if (p1.value !== p2.value) { err.textContent = 'Die beiden Eingaben stimmen nicht überein.'; err.hidden = false; return; }
      if (!db) { err.textContent = 'Die Datenablage ist in dieser Ansicht nicht erreichbar.'; err.hidden = false; return; }
      try { const l = liste(), salz = L.neuesSalz(), key = await L.schluesselAus(p1.value, salz, L.KRYPTO_ITER);
        SL.box = { salz, iter: L.KRYPTO_ITER }; SL.key = key; SL.keySalz = salz; SL.mem = l; SL.zustand = 'offen'; await boxSchreiben(l); await keyMerken(key, salz);
        try { localStorage.removeItem(LS); } catch (x) { /* nichts */ } toast(aendern ? 'Passwort geändert.' : 'Die Liste ist jetzt verschlüsselt gespeichert.', true); }
      catch (x) { err.textContent = 'Das hat nicht geklappt.'; err.hidden = false; }
      render(); } },
      h('div', { class: 'field' }, h('label', { for: 'pw_1' }, aendern ? 'Neues Passwort' : 'Passwort'), p1, h('span', { class: 'hint' }, 'Mindestens 10 Zeichen. Es wird nirgends gespeichert und lässt sich nicht wiederherstellen.')),
      h('div', { class: 'field' }, h('label', { for: 'pw_2' }, 'Passwort wiederholen'), p2), err, h('button', { type: 'submit', class: 'btn primary' }, aendern ? 'Passwort ändern' : 'Passwort festlegen'));
  }
  function listeAnsicht() {
    if (SL.zustand === 'laden') return [h('p', { class: 'note' }, 'Wird geladen …')];
    if (SL.zustand === 'gesperrt') return [h('div', { class: 'card warn' }, h('b', null, 'Liste gesperrt'), h('span', null, 'Die Liste ist verschlüsselt gespeichert. Gib das Passwort ein.'), sperrForm())];
    const l = liste(), text = h('input', { id: 'n_text', type: 'text', placeholder: 'z. B. Max Mustermann' }), wahl = { wert: '[Name]' };
    const neu = () => { const t = text.value.trim(); if (t.length < 2) return toast('Bitte mindestens 2 Zeichen eingeben.');
      if (l.some(x => x.text.toLowerCase() === t.toLowerCase())) return toast('Dieser Text steht schon in der Liste.');
      if (setListe(l.concat([{ text: t, label: wahl.wert }]))) { text.value = ''; render(); } };
    return [
      h('div', { class: 'card' }, h('b', null, 'Neuer Eintrag'),
        h('div', { class: 'field' }, h('label', { for: 'n_text' }, 'Text, der geschwärzt wird'), text),
        h('div', { class: 'field' }, h('label', { for: 'n_label' }, 'Beschriftung im Balken'), labelWahl('n_label', '[Name]', w => { wahl.wert = w; })),
        h('button', { type: 'button', class: 'btn primary', onclick: neu }, 'Hinzufügen')),
      h('div', { class: 'card' }, h('b', null, 'Liste (' + l.length + ')'),
        l.length ? l.map((x, i) => {
          const zeile = h('div', { class: 'eintrag' });
          const zeig = () => zeile.replaceChildren(h('span', { class: 'txt' }, h('span', { class: 't' }, x.text), h('span', { class: 's' }, x.label ? 'Balken: ' + x.label : 'Balken ohne Beschriftung')),
            h('button', { type: 'button', class: 'btn small', onclick: aendern }, 'Ändern'), h('button', { type: 'button', class: 'btn small', onclick: () => { const n = l.slice(); n.splice(i, 1); if (setListe(n)) render(); } }, 'Entfernen'));
          const aendern = () => { const t = h('input', { type: 'text', value: x.text, 'aria-label': 'Text' }), w = { wert: x.label };
            zeile.replaceChildren(h('div', { class: 'stapel', style: 'gap:8px;flex:1' }, t, labelWahl('e_' + i, x.label, v => { w.wert = v; }),
              h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn small primary', onclick: () => { if (t.value.trim().length < 2) return toast('Bitte mindestens 2 Zeichen.'); const n = l.slice(); n[i] = { text: t.value.trim(), label: w.wert }; if (setListe(n)) render(); } }, 'Speichern'), h('button', { type: 'button', class: 'btn small', onclick: zeig }, 'Abbrechen')))); };
          zeig(); return zeile;
        }) : h('p', { class: 'note' }, 'Noch leer.')),
      h('div', { class: 'card' }, h('b', null, 'Importieren und exportieren'),
        h('span', { class: 'note' }, 'Import: Textdatei mit einer Zeile je Eintrag „Text;Beschriftung“, oder die Export-Datei dieser App bzw. der Haushalts-App. Die Beschriftung ist frei, höchstens 30 Zeichen.'),
        h('div', { class: 'btnrow' },
          h('label', { class: 'btn', for: 'imp' }, 'Liste importieren'),
          h('button', { type: 'button', class: 'btn', disabled: !l.length, onclick: async ev => { const b = ev.currentTarget; b.disabled = true; try { await speichern('Schwaerzliste.txt', l.map(x => x.text + ';' + x.label).join('\n') + '\n'); toast('Liste exportiert'); } catch (e) { toast(e && e.code === 'declined' ? 'Abgebrochen.' : 'Export hat nicht geklappt.'); } b.disabled = false; } }, 'Liste exportieren')),
        h('input', { id: 'imp', type: 'file', accept: '.txt,.csv,.json,text/plain,text/csv,application/json', class: 'vh', onchange: async ev => {
          const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
          const g = SU.liesListe(L.dekodiere(await f.arrayBuffer())); if (!g) return toast('In dieser Datei wurde keine Liste gefunden.');
          const n = l.slice(); let neu = 0, anders = 0;
          for (const x of g) { const a = n.find(y => y.text.toLowerCase() === x.text.toLowerCase()); if (!a) { n.push(x); neu++; } else if (a.label !== x.label) { a.label = x.label; anders++; } }
          if (setListe(n)) { toast(neu + ' neu, ' + anders + ' geändert.'); render(); } } }),
        h('span', { class: 'note' }, 'Die Exportdatei enthält die Texte im Klartext. Bitte nur bei dir ablegen.')),
      h('div', { class: 'card' + (SL.zustand === 'offen' ? '' : ' warn') }, h('b', null, SL.zustand === 'offen' ? 'Verschlüsselt gespeichert' : 'Noch ohne Passwort'),
        h('span', { class: 'note' }, SL.zustand === 'offen' ? 'Die Liste liegt verschlüsselt in der Datenbank dieser App und gilt auf allen deinen Geräten.' : 'Die Liste liegt nur im Browser dieses Geräts und kann bei einem Update der App verloren gehen. Mit Passwort wird sie verschlüsselt in der Datenbank gespeichert.'),
        SL.zustand === 'offen' ? h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn small', onclick: async () => { await keyVergessen(); SL.key = null; SL.mem = []; SL.zustand = 'gesperrt'; render(); } }, 'Auf diesem Gerät sperren')) : pwForm(false))];
  }
  function render() {
    const tabs = [['schwaerzen', 'Schwärzen'], ['liste', 'Liste']];
    $('tabs').replaceChildren(...tabs.map(t => h('button', { type: 'button', role: 'tab', 'aria-selected': A.tab === t[0] ? 'true' : 'false', class: 'tab' + (A.tab === t[0] ? ' an' : ''), onclick: () => { A.tab = t[0]; render(); } }, t[1])));
    $('main').replaceChildren(...(A.tab === 'liste' ? listeAnsicht() : schwaerzenAnsicht()).flat(Infinity).filter(Boolean));
  }
  async function start() {
    render();
    try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (!db) { SL.zustand = 'keine'; return render(); }
    db.doc(KDOC).onSnapshot(s => boxNeu(s.exists ? s.data() : null), () => { SL.zustand = 'keine'; render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

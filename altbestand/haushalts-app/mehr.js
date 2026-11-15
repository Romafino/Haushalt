/* Haushalts-App: Suche, Deckungsübersicht, Notfallblatt, Angebot neben Vertrag, Zählerstände, Jahres-Check. */
(function () {
  'use strict';
  const HA = window.HA, { h, $, S, L } = HA;
  const link = (col, id, text) => h('a', { href: '#', onclick: e => { e.preventDefault(); HA.go({ name: 'detail', col, id }); } }, text);
  const zahl = (n, st) => n == null ? '–' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: st == null ? 2 : st });
  const ul = a => h('ul', { class: 'ul' }, a.map(x => h('li', null, typeof x === 'string' ? x : [x.was || x.thema, x.betrag].filter(Boolean).join(': '))));

  /* ---------- Suche (ohne Claude, direkt in der App) ---------- */
  const texte = { geladen: false, seiten: {} };
  HA.views.suche = { title: 'Suche', body: v => {
    const inp = h('input', { id: 'su_q', type: 'search', placeholder: 'Suchwort, z. B. Hausrat oder Wartung', value: v.q || '', 'aria-label': 'Suchbegriff' }), aus = h('div', { class: 'stapel' });
    const zeige = () => {
      const q = inp.value.trim(); v.q = q;
      if (q.length < 2) return aus.replaceChildren(HA.leer('Mindestens 2 Zeichen eingeben. Mehrere Wörter müssen alle vorkommen.'));
      const e = L.suche(S, q), t = texte.geladen ? L.sucheText(S, texte.seiten, q) : null;
      const zeile = x => h('button', { type: 'button', class: 'row', onclick: () => HA.go(x.col === 'belege' || x.col === 'fristen' ? { name: 'form', col: x.col, id: x.id } : { name: 'detail', col: x.col, id: x.id }) },
        h('span', { class: 'txt' }, h('span', { class: 't' }, x.titel), h('span', { class: 's' }, x.seite ? 'Seite ' + x.seite + ': ' + x.ausschnitt : [x.art, x.zusatz].filter(Boolean).join(' · '))));
      aus.replaceChildren(
        HA.sect('Einträge (' + e.length + ')', e.length ? HA.card(e.slice(0, 60).map(zeile)) : HA.leer('Kein Eintrag gefunden.')),
        t ? HA.sect('In Dokumenttexten (' + t.length + ')', t.length ? HA.card(t.slice(0, 60).map(zeile)) : HA.leer('In keinem gespeicherten Text gefunden.'))
          : (S.dokumente.length ? h('button', { type: 'button', class: 'btn', onclick: async ev => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'Texte werden geladen …';
              try { for (const d of S.dokumente) texte.seiten[d.id] = await HA.holeSeiten(d.id); texte.geladen = true; } catch (x) { HA.toast('Die Texte konnten nicht geladen werden.'); } zeige(); } }, 'Auch in den Texten von ' + S.dokumente.length + (S.dokumente.length === 1 ? ' Dokument' : ' Dokumenten') + ' suchen') : null));
    };
    let timer; inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(zeige, 200); });
    zeige();
    return [h('div', { class: 'field' }, inp), aus, h('p', { class: 'note' }, 'Die Suche läuft nur in der App. Es geht nichts an Claude. Für Fragen in ganzen Sätzen nimm „Fragen“ auf der Startseite.')];
  } };

  /* ---------- Deckungsübersicht ---------- */
  HA.views.deckung = { title: 'Deckungsübersicht', body: () => {
    const d = L.deckung(S, L.heute()), ohne = d.filter(x => !x.hatSteckbrief);
    if (!d.length) return [HA.leer('Noch keine laufende Versicherung eingetragen.')];
    return [
      h('p', { class: 'note' }, 'Stand heute, aus den gespeicherten Steckbriefen der laufenden Versicherungen. Was hier nicht steht, ist unklar, nicht „nicht versichert“. Keine Beratung.'),
      ohne.length ? h('div', { class: 'card box warn' }, h('b', null, ohne.length === 1 ? '1 Versicherung ohne Steckbrief' : ohne.length + ' Versicherungen ohne Steckbrief'), h('span', null, ohne.map(x => x.kurzname).join(', ') + ': Police über „+ Dokument“ hochladen.')) : null,
      d.map(x => h('div', { class: 'card' },
        h('div', { class: 'row' }, h('span', { class: 'txt' }, h('span', { class: 't' }, link('vertraege', x.vertragId, x.kurzname)), h('span', { class: 's' }, [x.firma, x.fuerWen.join(', '), x.bezug.join(', ')].filter(Boolean).join(' · '))),
          x.endet ? h('span', { class: 'pill warn' }, 'bis ' + L.fmt(x.endet)) : !x.hatSteckbrief ? h('span', { class: 'pill warn' }, 'kein Steckbrief') : null),
        x.hatSteckbrief ? h('dl', { class: 'kv', style: 'border-top:1px solid var(--line)' },
          x.gefahren.length ? [h('dt', null, 'Versichert'), h('dd', null, ul(x.gefahren))] : null, x.summen.length ? [h('dt', null, 'Summen'), h('dd', null, ul(x.summen))] : null,
          x.selbstbeteiligung ? [h('dt', null, 'Selbstbeteiligung'), h('dd', null, x.selbstbeteiligung)] : null, x.mitversichert.length ? [h('dt', null, 'Mitversichert'), h('dd', null, ul(x.mitversichert))] : null,
          x.ausschluesse.length ? [h('dt', null, 'Ausschlüsse'), h('dd', null, ul(x.ausschluesse))] : null,
          [h('dt', null, 'Quelle'), h('dd', null, link('dokumente', x.dokumentId, x.dokument))]) : null))];
  } };

  /* ---------- Notfallblatt ---------- */
  const pdfText = t => String(t == null ? '' : t).replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/€/g, 'EUR').replace(/[^\x09\x0a\x20-\x7e\xa0-\xff]/g, '');
  async function notfallPdf(n, knopf) {
    knopf.disabled = true;
    try {
      const lib = await new Promise((ok, no) => { if (window.jspdf) return ok(window.jspdf); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = () => ok(window.jspdf); s.onerror = () => no({ code: 'bibliothek' }); document.head.append(s); });
      const doc = new lib.jsPDF({ unit: 'mm', format: 'a4' }); let y = 18;
      const zeile = (t, gr, fett, einzug) => { doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(gr);
        for (const l of doc.splitTextToSize(pdfText(t), 180 - (einzug || 0))) { if (y > 282) { doc.addPage(); y = 18; } doc.text(l, 15 + (einzug || 0), y); y += gr * 0.45; } };
      const abstand = mm => { y += mm; };
      zeile('Notfallblatt Haushalt', 20, true); zeile('Stand: ' + L.fmt(n.stand) + '. Ohne Vertrags- und Kundennummern. Diese stehen auf den Policen.', 9, false); abstand(4);
      zeile('Sofortmaßnahmen im Schadenfall', 13, true); abstand(1); n.sofort.forEach((s, i) => zeile((i + 1) + '. ' + s, 10.5, false, 2)); abstand(4);
      const block = (titel, liste, leer) => { zeile(titel, 13, true); abstand(1);
        if (!liste.length) zeile(leer, 10.5, false, 2);
        for (const x of liste) { zeile(x.name + (x.hotline ? ':  ' + x.hotline : ':  keine Hotline eingetragen'), 11.5, true, 2); const z = [x.firma, x.art, x.fuerWen && 'für ' + x.fuerWen, x.bezug].filter(Boolean).join(' · '); if (z) zeile(z, 9.5, false, 2); abstand(1.5); }
        abstand(3); };
      block('Versicherungen', n.versicherungen, 'Keine laufende Versicherung eingetragen.');
      if (n.vertraege.length) block('Weitere Verträge (Störung, Service)', n.vertraege, '');
      if (n.firmen.length) block('Handwerker und weitere Kontakte', n.firmen, '');
      await HA.speichern('Notfallblatt-' + n.stand + '.pdf', doc.output('arraybuffer'));
      HA.toast('Notfallblatt geladen');
    } catch (e) { HA.hinweis(HA.dlFehler(e)); }
    knopf.disabled = false;
  }
  HA.views.notfall = { title: 'Notfallblatt', body: () => {
    const n = L.notfallDaten(S, S.einst, L.heute()), tel = t => t ? h('a', { href: 'tel:' + String(t).replace(/[^\d+]/g, '') }, t) : h('span', { class: 'note' }, 'keine Hotline eingetragen');
    const block = (titel, liste) => liste.length ? HA.sect(titel, HA.card(liste.map(x => h('div', { class: 'row' }, h('span', { class: 'txt' }, h('span', { class: 't' }, x.name), h('span', { class: 's' }, [x.firma, x.art, x.fuerWen && 'für ' + x.fuerWen, x.bezug].filter(Boolean).join(' · '))), h('span', { class: 'r' }, tel(x.hotline)))))) : null;
    return [
      h('button', { type: 'button', class: 'btn primary', onclick: e => notfallPdf(n, e.currentTarget) }, 'Als PDF laden'),
      h('p', { class: 'note' }, 'Zum Ausdrucken oder Weitergeben, etwa an die Tochter. Enthält Hotlines, laufende Verträge und Sofortmaßnahmen, aber keine Beträge, Namen oder Nummern.'),
      HA.sect('Sofortmaßnahmen', h('div', { class: 'card box' }, h('ol', { class: 'ul' }, n.sofort.map(t => h('li', null, t))))),
      block('Versicherungen', n.versicherungen) || HA.leer('Keine laufende Versicherung eingetragen.'), block('Weitere Verträge mit Telefon', n.vertraege), block('Handwerker und weitere Kontakte', n.firmen)];
  } };

  /* ---------- Angebot neben Vertrag ---------- */
  const altExtra = HA.vertragExtra;
  HA.vertragExtra = function (r) {
    const x = altExtra(r);
    if (S.vertraege.length > 1) x.knoepfe.push(h('button', { type: 'button', class: 'btn', onclick: () => HA.go({ name: 'vergleich', a: r.id }) }, r.status === 'angebot' ? 'Mit Vertrag vergleichen' : 'Mit Angebot vergleichen'));
    return x;
  };
  HA.views.vergleich = { title: 'Gegenüberstellung', body: v => {
    const a = HA.byId('vertraege', v.a), b = v.b && HA.byId('vertraege', v.b);
    if (!a) return [HA.leer('Der Vertrag ist nicht mehr vorhanden.')];
    if (!b) {
      const rang = x => (x.status === 'angebot' ? 0 : 2) + (L.istVers(x) === L.istVers(a) && x.art === a.art ? 0 : 1), andere = S.vertraege.filter(x => x.id !== a.id).sort((x, y) => rang(x) - rang(y) || x.kurzname.localeCompare(y.kurzname, 'de'));
      return [h('p', { class: 'note' }, a.kurzname + ': Womit vergleichen? Angebote stehen oben. Ein Angebot legst du über „+ Dokument“ an (Typ Angebot) oder von Hand als Vertrag mit Status „Angebot“.'),
        andere.length ? HA.card(andere.map(x => h('button', { type: 'button', class: 'row', onclick: () => { v.b = x.id; HA.rerender(); } }, h('span', { class: 'txt' }, h('span', { class: 't' }, x.kurzname), h('span', { class: 's' }, x.art)), h('span', { class: 'pill' + (x.status === 'angebot' ? '' : ' off') }, x.status)))) : HA.leer('Es gibt keinen zweiten Vertrag.')];
    }
    const g = L.vergleich(a, b, S, L.heute()), kopf = h('div', { class: 'vgl kopf' }, h('span', null, ''), h('b', null, link('vertraege', a.id, a.kurzname)), h('b', null, link('vertraege', b.id, b.kurzname)));
    return [
      h('p', { class: 'note' }, 'Gegenüberstellung der gespeicherten Angaben. Keine Bewertung und keine Empfehlung. Was im Steckbrief nicht steht, ist unklar.'),
      !g.steckbriefA || !g.steckbriefB ? h('div', { class: 'card box warn' }, 'Für ' + [!g.steckbriefA && a.kurzname, !g.steckbriefB && b.kurzname].filter(Boolean).join(' und ') + ' ist kein Steckbrief gespeichert. Die Leistungen lassen sich dann nicht gegenüberstellen.') : null,
      h('div', { class: 'card' }, kopf, g.zeilen.map(z => h('div', { class: 'vgl' + (z.gleich ? '' : ' anders') }, h('span', { class: 'note' }, z.label), h('span', null, z.a), h('span', null, z.b)))),
      g.differenzJahr != null ? h('p', { class: 'note' }, 'Unterschied im Beitrag: ' + (g.differenzJahr === 0 ? 'keiner' : b.kurzname + ' kostet im Jahr ' + HA.eur(Math.abs(g.differenzJahr)) + (g.differenzJahr > 0 ? ' mehr' : ' weniger') + ' als ' + a.kurzname) + '.') : null,
      g.listen.filter(l => l.beide.length || l.nurA.length || l.nurB.length).map(l => HA.sect(l.label, h('dl', { class: 'card kv' },
        l.beide.length ? [h('dt', null, 'In beiden'), h('dd', null, ul(l.beide))] : null, l.nurA.length ? [h('dt', null, 'Nur ' + a.kurzname), h('dd', null, ul(l.nurA))] : null, l.nurB.length ? [h('dt', null, 'Nur ' + b.kurzname), h('dd', null, ul(l.nurB))] : null))),
      h('p', { class: 'note' }, 'Die Listen vergleichen den Wortlaut der Steckbriefe. Gleiche Leistungen mit anderer Bezeichnung erscheinen deshalb getrennt.'),
      h('button', { type: 'button', class: 'btn', onclick: () => { v.b = null; HA.rerender(); } }, 'Anderen Vertrag wählen')];
  } };

  /* ---------- Zählerstände ---------- */
  HA.zaehlerDetail = function (v, r) {
    const ab = L.ablesungen(r.staende), jahre = L.verbrauchJeJahr(r.staende).reverse(), e = r.einheit || '', letzte = ab[0];
    const dat = h('input', { id: 'z_datum', type: 'date', value: L.heute() }), wert = h('input', { id: 'z_wert', type: 'text', inputmode: 'decimal', placeholder: letzte ? 'zuletzt ' + zahl(letzte.wert) : 'Zählerstand' });
    const von = h('input', { id: 'z_von', type: 'date', value: v.von || (ab.length ? ab[ab.length - 1].datum : '') }), bis = h('input', { id: 'z_bis', type: 'date', value: v.bis || (letzte ? letzte.datum : '') }), erg = h('p', { class: 'note' }, '');
    const schreibe = async liste => { try { await HA.db().doc('zaehler/' + v.id).update({ staende: liste }); } catch (x) { HA.toast('Speichern hat nicht geklappt.'); } };
    const rechne = () => { v.von = von.value; v.bis = bis.value; const x = von.value && bis.value ? L.verbrauch(r.staende, von.value, bis.value) : null;
      erg.textContent = !von.value || !bis.value ? '' : !x ? 'Für diesen Zeitraum gibt es keine Ablesungen davor und danach.' : 'Verbrauch: ' + zahl(x.menge) + ' ' + e + ' in ' + x.tage + ' Tagen (' + zahl(x.menge / x.tage) + ' ' + e + ' je Tag)' + (x.geschaetzt ? '. Geschätzt, weil an den Grenzen keine Ablesung liegt.' : '.'); };
    von.addEventListener('change', rechne); bis.addEventListener('change', rechne); rechne();
    return [
      HA.kv([['Art', r.art], ['Einheit', r.einheit], ['Vertrag', r.vertragId && HA.byId('vertraege', r.vertragId) && link('vertraege', r.vertragId, HA.byId('vertraege', r.vertragId).kurzname)], ['Ding', r.dingId && HA.byId('dinge', r.dingId) && link('dinge', r.dingId, HA.byId('dinge', r.dingId).name)], ['Notiz', r.notiz]]),
      HA.sect('Neue Ablesung', h('form', { novalidate: true, onsubmit: async ev => { ev.preventDefault();
        const w = parseFloat(wert.value.replace(/\./g, '').replace(',', '.'));
        if (!dat.value || isNaN(w) || w < 0) return HA.toast('Bitte Datum und Zählerstand als Zahl eingeben.');
        await schreibe((r.staende || []).filter(x => x.datum !== dat.value).concat([{ datum: dat.value, wert: w }])); HA.toast('Ablesung gespeichert');
      } }, h('div', { class: 'field' }, h('label', { for: 'z_datum' }, 'Datum'), dat), h('div', { class: 'field' }, h('label', { for: 'z_wert' }, 'Zählerstand in ' + e), wert), h('button', { type: 'submit', class: 'btn primary' }, 'Ablesung speichern'))),
      HA.sect('Verbrauch je Jahr', jahre.length ? HA.card(jahre.map(j => h('div', { class: 'row' }, h('span', { class: 'txt' }, h('span', { class: 't' }, String(j.jahr)), h('span', { class: 's' }, (j.ganz ? 'ganzes Jahr' : 'Teiljahr, ' + j.tage + ' Tage') + (j.geschaetzt ? ' · an der Jahresgrenze geschätzt' : ''))), h('span', { class: 'r' }, zahl(j.menge, 0) + ' ' + e)))) : HA.leer('Ab zwei Ablesungen rechnet die App den Verbrauch aus.')),
      HA.sect('Verbrauch im Zeitraum', h('p', { class: 'note' }, 'Zum Abgleich mit der Jahresabrechnung: Zeitraum der Abrechnung eintragen.'), h('div', { class: 'field' }, h('label', { for: 'z_von' }, 'Von'), von), h('div', { class: 'field' }, h('label', { for: 'z_bis' }, 'Bis'), bis), erg),
      HA.sect('Ablesungen', ab.length ? HA.card(ab.map(a => h('div', { class: 'row' + (a.wechsel ? ' stripe warn' : '') }, h('span', { class: 'txt' }, h('span', { class: 't' }, L.fmt(a.datum) + ': ' + zahl(a.wert) + ' ' + e),
        h('span', { class: 's' }, a.seit == null ? 'erste Ablesung' : a.wechsel ? 'Stand ist niedriger als davor: Zählerwechsel? Die Rechnung stimmt dann nicht.' : '+' + zahl(a.seit) + ' ' + e + ' in ' + a.tage + ' Tagen' + (a.jeTag != null ? ' (' + zahl(a.jeTag) + ' je Tag)' : ''))),
        h('button', { type: 'button', class: 'btn small', onclick: async ev => { ev.currentTarget.disabled = true; await schreibe((r.staende || []).filter(x => x.datum !== a.datum)); } }, 'Entfernen')))) : HA.leer('Noch keine Ablesung.')),
      h('button', { type: 'button', class: 'btn', onclick: () => HA.go({ name: 'form', col: 'zaehler', id: v.id }) }, 'Zähler bearbeiten')];
  };

  /* ---------- Jahres-Check ---------- */
  HA.views.jahrescheck = { title: 'Jahres-Check', body: v => {
    const tag = L.heute(), jahr = tag.slice(0, 4), st = L.jahresStand(S, S.einst, jahr), bef = L.jahresBefunde(S, tag), arten = Array.from(new Set(bef.map(b => b.art)));
    const merke = async (id, an) => { const jc = Object.assign({}, S.einst.jahrescheck), j = Object.assign({}, jc[jahr]); if (an) j[id] = tag; else delete j[id]; jc[jahr] = j;
      try { await HA.einstSpeichern(Object.assign({}, S.einst, { jahrescheck: jc })); } catch (e) { HA.toast('Speichern hat nicht geklappt.'); } HA.rerender(); };
    const termin = S.fristen.find(f => f.quelle === 'jahrescheck' && f.status !== 'erledigt');
    const ziel = b => HA.go(b.col === 'belege' ? { name: 'form', col: 'belege', id: b.id } : { name: 'detail', col: b.col, id: b.id });
    return [
      h('div', { class: 'card box' }, h('b', null, jahr + ': ' + st.erledigt + ' von ' + st.gesamt + ' laufenden Verträgen angesehen'), h('span', { class: 'note' }, 'Einmal im Jahr jeden Vertrag kurz öffnen: Stimmen Beitrag, Laufzeit, Bezug und Rolle noch? Dann abhaken.')),
      HA.sect('Auffälligkeiten (' + bef.length + ')', bef.length ? arten.map(a => h('div', { class: 'card rows' }, h('div', { class: 'row' }, h('span', { class: 't' }, a)),
        bef.filter(b => b.art === a).map(b => h('button', { type: 'button', class: 'row', onclick: () => ziel(b) }, h('span', { class: 's' }, b.text))))) : HA.leer('Nichts Auffälliges gefunden.')),
      HA.sect('Verträge durchsehen', st.liste.length ? HA.card(st.liste.map(x => h('div', { class: 'row' },
        h('button', { type: 'button', class: 'txt', style: 'border:0;background:none;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer', onclick: () => HA.go({ name: 'detail', col: 'vertraege', id: x.id }) }, h('span', { class: 't' }, x.kurzname), h('span', { class: 's' }, x.art + (x.angesehen ? ' · angesehen am ' + L.fmt(x.angesehen) : ''))),
        h('button', { type: 'button', class: 'btn small' + (x.angesehen ? '' : ' primary'), onclick: () => merke(x.id, !x.angesehen) }, x.angesehen ? 'Zurücknehmen' : 'Angesehen')))) : HA.leer('Keine laufenden Verträge.')),
      termin ? h('p', { class: 'note' }, 'Nächster Jahres-Check als Termin am ' + L.fmt(termin.datum) + '.')
        : h('button', { type: 'button', class: 'btn', onclick: async e => { e.currentTarget.disabled = true; const d = (Number(jahr) + 1) + '-01-15';
            try { await HA.db().collection('fristen').add({ titel: 'Jahres-Check der Haushalts-Akte', datum: d, status: 'offen', wiederholung: '12', quelle: 'jahrescheck', angelegt: tag }); HA.toast('Termin am ' + L.fmt(d) + ' angelegt, wiederholt sich jährlich.'); } catch (x) { HA.toast('Hat nicht geklappt.'); } setTimeout(HA.rerender, 200); } }, 'Jährlichen Termin anlegen (15. Januar)')];
  } };
})();

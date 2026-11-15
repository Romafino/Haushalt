const L = require('../haushalts-app/logic.js'); const assert = require('assert');
const eq = (a, b, n) => { assert.deepStrictEqual(a, b, n); console.log('ok  ' + n); };
(async () => {
  const liste = [{ text: 'Max Mustermann', ersatz: '[Vater]' }, { text: 'Beispielstraße', ersatz: '[Adresse]' }];
  const salz = L.neuesSalz(), key = await L.schluesselAus('vier zufällige Wörter hier', salz, 1000);
  const box = await L.verschluesseln(key, { liste });
  eq([typeof box.iv, box.daten.includes('Mustermann'), Buffer.from(box.daten, 'base64').includes(Buffer.from('Mustermann'))], ['string', false, false], 'verschlüsselt: Namen stehen nicht im gespeicherten Text');
  eq((await L.entschluesseln(await L.schluesselAus('vier zufällige Wörter hier', salz, 1000), box)).liste, liste, 'richtiges Passwort: Liste wieder da');
  let fehler = null; try { await L.entschluesseln(await L.schluesselAus('falsches Passwort!!', salz, 1000), box); } catch (e) { fehler = e.code; }
  eq(fehler, 'passwort', 'falsches Passwort: abgelehnt');
  fehler = null; try { await L.entschluesseln(await L.schluesselAus('vier zufällige Wörter hier', L.neuesSalz(), 1000), box); } catch (e) { fehler = e.code; }
  eq(fehler, 'passwort', 'anderes Salz (Passwort neu gesetzt): abgelehnt');
  const box2 = await L.verschluesseln(key, { liste }); eq(box2.iv !== box.iv && box2.daten !== box.daten, true, 'jede Speicherung mit neuem Zufallswert');
  const kaputt = Object.assign({}, box, { daten: box.daten.slice(0, -4) + 'AAAA' }); fehler = null; try { await L.entschluesseln(key, kaputt); } catch (e) { fehler = e.code; }
  eq(fehler, 'passwort', 'veränderter Text: erkannt und abgelehnt');
  const imp = L.importOps({ app: 'haushalts-app', format: 1, sammlungen: {}, schwaerzlisteVerschluesselt: { v: 1, salz, iter: 1000, iv: box.iv, daten: box.daten } });
  eq(imp.ops.map(o => o.pfad), ['einstellungen/schwaerzliste'], 'Sicherung: verschlüsselte Liste wird mit importiert');
  console.log('\nAlle Tests bestanden.');
})().catch(e => { console.error(e); process.exit(1); });

/* Minimaler ZIP-Schreiber (Methode „stored“, ohne Kompression). Reines Modul, ohne Bibliothek.
   Reicht für Excel-Dateien (.xlsx sind ZIP) und den Export; JPEGs lassen sich ohnehin kaum komprimieren. */
const TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABELLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEintrag = { name: string; daten: Uint8Array | string };

export function zip(eintraege: ZipEintrag[], jetzt = new Date()): Uint8Array {
  const enc = new TextEncoder(), teile: Uint8Array[] = [], zentral: Uint8Array[] = [];
  const zeit = ((jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | (jetzt.getSeconds() >> 1)) & 0xffff;
  const datum = (((jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate()) & 0xffff;
  let offset = 0;
  for (const e of eintraege) {
    const name = enc.encode(e.name), d = typeof e.daten === 'string' ? enc.encode(e.daten) : e.daten, crc = crc32(d);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true); kopf.setUint16(4, 20, true); kopf.setUint16(6, 0x0800, true); // UTF-8-Namen
    kopf.setUint16(8, 0, true); kopf.setUint16(10, zeit, true); kopf.setUint16(12, datum, true);
    kopf.setUint32(14, crc, true); kopf.setUint32(18, d.length, true); kopf.setUint32(22, d.length, true);
    kopf.setUint16(26, name.length, true); kopf.setUint16(28, 0, true);
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint16(8, 0x0800, true);
    z.setUint16(10, 0, true); z.setUint16(12, zeit, true); z.setUint16(14, datum, true); z.setUint32(16, crc, true);
    z.setUint32(20, d.length, true); z.setUint32(24, d.length, true); z.setUint16(28, name.length, true);
    z.setUint32(42, offset, true);
    teile.push(new Uint8Array(kopf.buffer), name, d);
    zentral.push(new Uint8Array(z.buffer), name);
    offset += 30 + name.length + d.length;
  }
  const groesse = zentral.reduce((s, x) => s + x.length, 0);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true); ende.setUint16(8, eintraege.length, true); ende.setUint16(10, eintraege.length, true);
  ende.setUint32(12, groesse, true); ende.setUint32(16, offset, true);
  const alles = [...teile, ...zentral, new Uint8Array(ende.buffer)];
  const out = new Uint8Array(alles.reduce((s, x) => s + x.length, 0));
  let p = 0; for (const x of alles) { out.set(x, p); p += x.length; }
  return out;
}

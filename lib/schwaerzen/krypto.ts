/* Übernommen aus altbestand/haushalts-app/logic.js: Verschlüsselung der Schwärzliste (PBKDF2-SHA256 + AES-GCM, Web Crypto). Verhalten unverändert. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* ---------- Verschlüsselung der Schwärzliste: PBKDF2 (SHA-256) + AES-GCM, nur mit Bordmitteln des Browsers ---------- */
const WC = (): any => (typeof crypto !== 'undefined' && crypto.subtle ? crypto : null);
const b64 = (u8: any) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (s: any) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const KRYPTO_ITER = 310000;
async function schluesselAus(passwort: any, salzB64: any, iter: any) {
  const c = WC(); if (!c) throw { code: 'krypto' };
  const basis = await c.subtle.importKey('raw', new TextEncoder().encode(String(passwort)), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salzB64), iterations: iter || KRYPTO_ITER, hash: 'SHA-256' }, basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const neuesSalz = () => b64(WC().getRandomValues(new Uint8Array(16)));
async function verschluesseln(key: any, wert: any) {
  const iv = WC().getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await WC().subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(wert))));
  return { iv: b64(iv), daten: b64(ct) };
}
/* Wirft { code: 'passwort' }, wenn der Schlüssel nicht passt (AES-GCM prüft das selbst). */
async function entschluesseln(key: any, box: any) {
  let pt; try { pt = await WC().subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.daten)); } catch { throw { code: 'passwort' }; }
  return JSON.parse(new TextDecoder().decode(pt));
}


export { schluesselAus, neuesSalz, verschluesseln, entschluesseln, KRYPTO_ITER };

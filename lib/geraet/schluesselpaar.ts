"use client";
/* Einmalige Einrichtung: VAPID-Schlüsselpaar (P-256) und Cron-Geheimnis im Browser erzeugen.
   Die Werte verlassen das Gerät nur, wenn die Person sie selbst in Vercel einträgt. */
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function einrichtungsSchluessel() {
  const paar = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const oeffentlich = b64url(await crypto.subtle.exportKey("raw", paar.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", paar.privateKey);
  return { oeffentlich, privat: String(jwk.d), cron: b64url(crypto.getRandomValues(new Uint8Array(32))) };
}

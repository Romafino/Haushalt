"use client";
/* Datensicherung vom Gerät aus: alle Tabellen des Haushalts (auch Verworfenes) und auf Wunsch die Bilder laden,
   mit Passwort verschlüsseln und als Datei speichern. Läuft mit der Anmeldung der Person (RLS). */
import { supabaseBrowser } from "@/lib/supabase/browser";
import { inhaltAus, TABELLEN, verschluesselt, type Inhalt } from "@/lib/akte/sicherung";

async function alleZeilen(tabelle: string, haushaltId: string) {
  const sb = supabaseBrowser(), out: Record<string, unknown>[] = [];
  for (let von = 0; ; von += 1000) {
    const q = sb.from(tabelle).select("*").range(von, von + 999);
    const { data, error } = await (tabelle === "haushalte" ? q.eq("id", haushaltId) : q.eq("haushalt_id", haushaltId));
    if (error) throw new Error(`Tabelle ${tabelle} konnte nicht gelesen werden.`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const base64 = async (b: Blob) => {
  const u8 = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(s);
};

export async function sicherungErstellen(haushaltId: string, passwort: string, mitBildern: boolean, status: (t: string) => void) {
  const tabellen: Inhalt["tabellen"] = {};
  for (const [i, t] of TABELLEN.entries()) {
    status(`Daten werden gelesen (${i + 1}/${TABELLEN.length}) …`);
    tabellen[t] = await alleZeilen(t, haushaltId);
  }
  const dateien: Inhalt["dateien"] = {};
  let fehlend = 0;
  if (mitBildern) {
    const pfade = [
      ...(tabellen.dokument_bilder ?? []).map((z) => ["dokumente", String(z.pfad)]),
      ...(tabellen.schaden_fotos ?? []).map((z) => ["schadenfotos", String(z.pfad)]),
    ];
    const sb = supabaseBrowser();
    for (const [i, [bucket, pfad]] of pfade.entries()) {
      status(`Bilder werden geladen (${i + 1}/${pfade.length}) …`);
      const { data } = await sb.storage.from(bucket).download(pfad);
      if (data) dateien[`${bucket}/${pfad}`] = await base64(data); else fehlend++;
    }
  }
  status("Wird verschlüsselt …");
  const jetzt = new Date();
  const datei = await verschluesselt(inhaltAus(tabellen, dateien, jetzt), passwort);
  const blob = new Blob([JSON.stringify(datei)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `haushalt-sicherung-${jetzt.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);

  // Datum der letzten Sicherung merken (nur das Datum, keine Inhalte)
  const sb = supabaseBrowser();
  const h = await sb.from("haushalte").select("einstellungen").eq("id", haushaltId).single();
  await sb.from("haushalte").update({ einstellungen: { ...(h.data?.einstellungen ?? {}), letzteSicherung: jetzt.toISOString().slice(0, 10) } }).eq("id", haushaltId);
  return { groesseMb: Math.round((blob.size / 1048576) * 10) / 10, bilder: Object.keys(dateien).length, fehlend };
}

/** Monatliche Erinnerung (wiederkehrender Termin) anlegen, falls noch keine da ist. */
export async function erinnerungAnlegen(haushaltId: string, datum: string): Promise<string | null> {
  const sb = supabaseBrowser();
  const da = await sb.from("termine").select("id").eq("haushalt_id", haushaltId).eq("quelle", "sicherung").is("verworfen_am", null).limit(1);
  if (da.data?.length) return "Die monatliche Erinnerung gibt es schon (unter Termine).";
  const { error } = await sb.from("termine").insert({ haushalt_id: haushaltId, titel: "Datensicherung erstellen", datum, wiederholung_monate: 1, quelle: "sicherung", notiz: "Übersicht → Datensicherung" });
  return error ? "Die Erinnerung konnte nicht angelegt werden." : null;
}

const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Sicherung zurückspielen: ersetzt ALLE Daten dieses Haushalts (eine Transaktion in der Datenbank).
    Ablauf: Bilder hochladen → Daten ersetzen → nicht mehr benutzte Bilder entfernen. Scheitert das Ersetzen, werden nur neu hochgeladene Bilder wieder entfernt. */
export async function sicherungEinspielen(haushaltId: string, inhalt: Inhalt, status: (t: string) => void) {
  const sb = supabaseBrowser();
  const alt = String(inhalt.tabellen.haushalte?.[0]?.id ?? "");
  // Haushalts-ID der Sicherung durch die des Ziels ersetzen (steht auch in Bild-Pfaden)
  const ersetzen = (t: string) => (alt && alt !== haushaltId ? t.replace(UUID_G, (u) => (u === alt ? haushaltId : u)) : t);
  const tabellen = JSON.parse(ersetzen(JSON.stringify(inhalt.tabellen))) as Inhalt["tabellen"];
  const dateien = Object.entries(inhalt.dateien).map(([k, v]) => [ersetzen(k), v] as const);

  const vorher = await Promise.all([
    sb.from("dokument_bilder").select("pfad").eq("haushalt_id", haushaltId),
    sb.from("schaden_fotos").select("pfad").eq("haushalt_id", haushaltId),
  ]);
  const altePfade = new Set([...(vorher[0].data ?? []).map((z) => "dokumente/" + z.pfad), ...(vorher[1].data ?? []).map((z) => "schadenfotos/" + z.pfad)]);

  const hochgeladen: string[] = [];
  for (const [i, [schluessel, b64]] of dateien.entries()) {
    status(`Bilder werden hochgeladen (${i + 1}/${dateien.length}) …`);
    const [bucket, ...rest] = schluessel.split("/");
    const { error } = await sb.storage.from(bucket).upload(rest.join("/"), bytes(b64), { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error("Ein Bild konnte nicht hochgeladen werden. Es wurde nichts ersetzt.");
    hochgeladen.push(schluessel);
  }
  const entfernen = async (liste: string[]) => {
    for (const bucket of ["dokumente", "schadenfotos"]) {
      const p = liste.filter((x) => x.startsWith(bucket + "/")).map((x) => x.slice(bucket.length + 1));
      if (p.length) await sb.storage.from(bucket).remove(p);
    }
  };

  status("Daten werden ersetzt …");
  const daten: Record<string, unknown> = { ...tabellen, einstellungen: tabellen.haushalte?.[0]?.einstellungen ?? undefined };
  delete daten.haushalte;
  const { data, error } = await sb.rpc("sicherung_einspielen", { p_haushalt_id: haushaltId, p_daten: daten });
  if (error) {
    await entfernen(hochgeladen.filter((p) => !altePfade.has(p)));
    throw new Error(error.code === "23505" ? "Die Sicherung gehört zu einem anderen Haushalt, der hier noch existiert. Es wurde nichts ersetzt." : "Die Sicherung konnte nicht zurückgespielt werden. Es wurde nichts ersetzt.");
  }
  const neu = new Set(hochgeladen);
  await entfernen([...altePfade].filter((p) => !neu.has(p)));
  return data as Record<string, number>;
}

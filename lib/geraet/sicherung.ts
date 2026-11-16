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

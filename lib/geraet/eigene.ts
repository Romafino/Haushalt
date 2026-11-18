"use client";
/* Eigenen Auswahlwert in die Haushalts-Einstellungen übernehmen (frisch gelesen, damit andere Einstellungen erhalten bleiben). */
import { supabaseBrowser } from "@/lib/supabase/browser";
import * as R from "@/lib/regeln";

/** null = gespeichert oder schon vorhanden; sonst Fehlertext. */
export async function eigenenWertSpeichern(haushaltId: string, liste: string, wert: string): Promise<string | null> {
  const sb = supabaseBrowser();
  const h = await sb.from("haushalte").select("einstellungen").eq("id", haushaltId).single();
  if (h.error) return "Konnte nicht gespeichert werden.";
  const einst = R.mitEigenem(h.data?.einstellungen ?? {}, liste, wert);
  if (!einst) return null;
  const { error } = await sb.from("haushalte").update({ einstellungen: einst }).eq("id", haushaltId);
  return error ? "Konnte nicht gespeichert werden." : null;
}

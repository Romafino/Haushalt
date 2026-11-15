"use client";
/* Lädt Haushalt und Akte im Browser (mit der Anmeldung der Person) und stellt Schreibhilfen bereit. */
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ladeAkte } from "./laden";
import { zuZeile, type Akte, type Tabelle } from "./abbilden";
import type { DbOp } from "./ops";

export function useAkte() {
  const [haushaltId, setHaushaltId] = useState<string | null>(null);
  const [akte, setAkte] = useState<Akte | null>(null);
  const [fehler, setFehler] = useState("");

  const neuLaden = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data, error } = await sb.from("haushalte").select("id").is("verworfen_am", null).order("erstellt_am").limit(1);
    if (error) return setFehler("Daten konnten nicht geladen werden.");
    if (!data?.length) return setFehler("Noch kein Haushalt angelegt.");
    setHaushaltId(data[0].id);
    try {
      setAkte(await ladeAkte(sb, data[0].id));
    } catch {
      setFehler("Die Akte konnte nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    // Erstes Laden nach dem Rendern; neuLaden() setzt den Zustand erst nach der Antwort.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void neuLaden();
  }, [neuLaden]);

  return { haushaltId, akte, fehler, neuLaden };
}

/** Speichert einen Eintrag (neu: id null). Gibt die ID zurück oder wirft einen lesbaren Fehler. */
export async function speichern(tabelle: Tabelle, haushaltId: string, id: string | null, werte: Record<string, unknown>): Promise<string> {
  const sb = supabaseBrowser();
  const zeile = zuZeile(tabelle, werte);
  const r = id
    ? await sb.from(tabelle).update(zeile).eq("id", id).eq("haushalt_id", haushaltId).select("id").single()
    : await sb.from(tabelle).insert({ ...zeile, haushalt_id: haushaltId }).select("id").single();
  if (r.error) throw new Error(lesbar(r.error.code));
  return r.data.id as string;
}

export async function vertragSpeichern(haushaltId: string, id: string | null, werte: Record<string, unknown>, dinge: string[], rollen: string[]): Promise<string> {
  const { data, error } = await supabaseBrowser().rpc("vertrag_speichern", {
    p_haushalt_id: haushaltId, p_id: id, p_daten: zuZeile("vertraege", werte), p_dinge: dinge, p_rollen: rollen,
  });
  if (error) throw new Error(lesbar(error.code));
  return data as string;
}

/** Schreib-Schritte des Regelmoduls (bereits übersetzt) in einer Transaktion anwenden. */
export async function opsAnwenden(haushaltId: string, ops: DbOp[]): Promise<void> {
  if (!ops.length) return;
  const { error } = await supabaseBrowser().rpc("ops_anwenden", { p_haushalt_id: haushaltId, p_ops: ops });
  if (error) throw new Error(lesbar(error.code));
}

/** Standard: verwerfen (wiederherstellbar). */
export async function verwerfen(tabelle: Tabelle, haushaltId: string, id: string) {
  const { error } = await supabaseBrowser().from(tabelle).update({ verworfen_am: new Date().toISOString() }).eq("id", id).eq("haushalt_id", haushaltId);
  if (error) throw new Error(lesbar(error.code));
}

/** Endgültig löschen: nur nach Rückfrage in der Oberfläche aufrufen. */
export async function endgueltigLoeschen(tabelle: Tabelle, haushaltId: string, id: string) {
  const { error } = await supabaseBrowser().from(tabelle).delete().eq("id", id).eq("haushalt_id", haushaltId);
  if (error) throw new Error(lesbar(error.code));
}

function lesbar(code?: string): string {
  if (code === "23514") return "Ein Wert ist nicht zulässig. Bitte Eingaben prüfen.";
  if (code === "23503") return "Ein Verweis passt nicht (z. B. gelöschte Firma). Bitte neu auswählen.";
  if (code === "42501") return "Keine Berechtigung.";
  return "Speichern hat nicht geklappt. Bitte erneut versuchen.";
}

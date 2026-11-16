"use client";
/* Dublettenerkennung vor dem KI-Aufruf und vor dem Speichern: der geschwärzte Text wird mit den gespeicherten Dokumenten verglichen (Datenbank, Trigramme). */
import { supabaseBrowser } from "@/lib/supabase/browser";
import { seitenText } from "@/lib/schwaerzen/seitentext";
import type { ListenEintrag } from "@/lib/schwaerzen/liste";
import type { Seite } from "./seiten";

export type Dublette = { dokument_id: string; titel: string | null; typ: string; datum: string | null; aehnlichkeit: number; gleich: boolean };

export async function dublettenSuchen(haushaltId: string, seiten: Seite[], liste: ListenEintrag[]): Promise<Dublette[]> {
  const text = seiten.map((s) => seitenText(s.stuecke, s.balken, liste)).join(" ");
  if (text.trim().length < 20) return [];
  const { data, error } = await supabaseBrowser().rpc("dokument_dubletten", { p_haushalt: haushaltId, p_text: text });
  return error ? [] : ((data ?? []) as Dublette[]);
}

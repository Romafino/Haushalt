"use client";
/* Geschwärztes Dokument speichern: Bilder in Storage, dann Dokument + Seiten + Bilder (+ Folgen) in einer Transaktion.
   Schlägt die Transaktion fehl, werden die hochgeladenen Bilder wieder entfernt. */
import { supabaseBrowser } from "@/lib/supabase/browser";
import { zuZeile } from "@/lib/akte/abbilden";
import type { DbOp } from "@/lib/akte/ops";
import { listenTreffer, seitenText } from "@/lib/schwaerzen/seitentext";
import type { ListenEintrag } from "@/lib/schwaerzen/liste";
import { geschwaerztesBild, type Seite } from "./seiten";

export function befund(seiten: Seite[]) {
  const z: Record<string, number> = {};
  for (const b of seiten.flatMap((s) => s.balken)) { const k = b.quelle ?? "hand"; z[k] = (z[k] ?? 0) + 1; }
  return z;
}

export async function dokumentSpeichern(p: {
  haushaltId: string; meta: Record<string, unknown>; seiten: Seite[]; quelle: "pdf" | "foto"; liste: ListenEintrag[]; ops?: DbOp[]; id?: string;
  status: (t: string) => void;
}): Promise<string> {
  const sb = supabaseBrowser();
  const id = p.id ?? crypto.randomUUID();
  const texte = p.seiten.map((s) => seitenText(s.stuecke, s.balken, p.liste));
  // letzte Absicherung: kein Eintrag der Schwärzliste darf im gespeicherten Text stehen
  const rest = texte.flatMap((t) => listenTreffer(t, p.liste));
  if (rest.length) throw new Error("Im Text steht noch etwas aus der Schwärzliste. Bitte die Seiten prüfen.");

  const pfade: string[] = [];
  try {
    for (let i = 0; i < p.seiten.length; i++) {
      p.status(`Seite ${i + 1} von ${p.seiten.length} wird hochgeladen …`);
      const pfad = `${p.haushaltId}/${id}/${i + 1}.jpg`;
      const { error } = await sb.storage.from("dokumente").upload(pfad, await geschwaerztesBild(p.seiten[i]), { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(/exist|duplicate/i.test(error.message) ? "Dieses Dokument ist schon gespeichert (unter Dokumente). Für ein neues Dokument bitte „Neu beginnen“." : "Hochladen hat nicht geklappt.");
      pfade.push(pfad);
    }
    p.status("Wird gespeichert …");
    const { error } = await sb.rpc("dokument_speichern", {
      p_haushalt_id: p.haushaltId,
      p_dokument: { ...zuZeile("dokumente", p.meta), id, seiten: p.seiten.length, quelle: p.quelle, datenschutz: befund(p.seiten) },
      p_seiten: texte.map((text, i) => ({ nr: i + 1, text })),
      p_bilder: pfade.map((pfad, i) => ({ nr: i + 1, pfad })),
      p_ops: p.ops ?? [],
    });
    if (error) throw new Error("Speichern hat nicht geklappt.");
    return id;
  } catch (e) {
    if (pfade.length) await sb.storage.from("dokumente").remove(pfade);
    throw e;
  }
}

/** Endgültig löschen: erst Bilder in Storage, dann das Dokument (Seiten und Bild-Einträge gehen mit). */
export async function dokumentLoeschen(haushaltId: string, id: string) {
  const sb = supabaseBrowser();
  const { data } = await sb.from("dokument_bilder").select("pfad").eq("dokument_id", id);
  if (data?.length) {
    const { error } = await sb.storage.from("dokumente").remove(data.map((b) => b.pfad as string));
    if (error) throw new Error("Bilder konnten nicht gelöscht werden.");
  }
  const { error } = await sb.from("dokumente").delete().eq("id", id).eq("haushalt_id", haushaltId);
  if (error) throw new Error("Löschen hat nicht geklappt.");
}

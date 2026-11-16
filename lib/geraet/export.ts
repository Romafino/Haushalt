"use client";
/* Lesbarer Export (ZIP): Excel-Datei mit allen Tabellen, Seitentexte der Dokumente, auf Wunsch Bilder und Schadenfotos.
   Unverschlüsselt – deshalb deutlicher Hinweis in der Oberfläche und in LIESMICH.txt. */
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Akte } from "@/lib/akte/abbilden";
import { dateiname, exportBlaetter, LIESMICH } from "@/lib/export/blaetter";
import { xlsx } from "@/lib/export/xlsx";
import { zip, type ZipEintrag } from "@/lib/export/zip";
import * as R from "@/lib/regeln";

export async function lesbarerExport(haushaltId: string, S: Akte, mitBildern: boolean, status: (t: string) => void) {
  const sb = supabaseBrowser();
  status("Daten werden gelesen …");
  const [sf, pr, fr, seiten, bilder, fotos] = await Promise.all([
    sb.from("schadenfaelle").select("*").eq("haushalt_id", haushaltId),
    sb.from("schaden_pruefungen").select("*").eq("haushalt_id", haushaltId),
    sb.from("fragen").select("*").eq("haushalt_id", haushaltId),
    sb.from("dokument_seiten").select("dokument_id, nr, text").eq("haushalt_id", haushaltId).order("nr"),
    mitBildern ? sb.from("dokument_bilder").select("dokument_id, nr, pfad").eq("haushalt_id", haushaltId) : Promise.resolve({ data: [] as { dokument_id: string; nr: number; pfad: string }[] }),
    mitBildern ? sb.from("schaden_fotos").select("schaden_id, pfad").eq("haushalt_id", haushaltId).order("erstellt_am") : Promise.resolve({ data: [] as { schaden_id: string; pfad: string }[] }),
  ]);
  const heute = R.heute();
  const schadenfaelle = sf.data ?? [];
  const eintraege: ZipEintrag[] = [
    { name: "LIESMICH.txt", daten: LIESMICH(R.fmt(heute)) },
    { name: "haushalt.xlsx", daten: xlsx(exportBlaetter(S, { schadenfaelle, pruefungen: pr.data ?? [], fragen: fr.data ?? [] }, heute)) },
  ];
  const dokOrdner = (id: string) => "dokumente/" + dateiname(S.dokumente.find((d) => d.id === id)?.titel, id);
  for (const s of seiten.data ?? []) {
    if (!S.dokumente.some((d) => d.id === s.dokument_id)) continue; // verworfene Dokumente nicht
    eintraege.push({ name: `${dokOrdner(s.dokument_id)}/seite-${s.nr}.txt`, daten: s.text });
  }
  const laden = async (bucket: string, pfad: string) => (await sb.storage.from(bucket).download(pfad)).data;
  const alle = [
    ...(bilder.data ?? []).filter((b) => S.dokumente.some((d) => d.id === b.dokument_id)).map((b) => ({ bucket: "dokumente", pfad: b.pfad, name: `${dokOrdner(b.dokument_id)}/seite-${b.nr}.jpg` })),
    ...(fotos.data ?? []).map((f, i) => ({ bucket: "schadenfotos", pfad: f.pfad, name: `schaden/${dateiname(schadenfaelle.find((s) => s.id === f.schaden_id)?.titel, f.schaden_id)}/foto-${i + 1}.jpg` })),
  ];
  for (const [i, b] of alle.entries()) {
    status(`Bilder werden geladen (${i + 1}/${alle.length}) …`);
    const blob = await laden(b.bucket, b.pfad);
    if (blob) eintraege.push({ name: b.name, daten: new Uint8Array(await blob.arrayBuffer()) });
  }
  status("ZIP-Datei wird gebaut …");
  const daten = zip(eintraege);
  const blob = new Blob([daten as BlobPart], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `haushalt-export-${heute}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return { groesseMb: Math.round((blob.size / 1048576) * 10) / 10, dateien: eintraege.length };
}

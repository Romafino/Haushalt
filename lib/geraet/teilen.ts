"use client";
/* Datei teilen oder speichern: auf dem iPhone über das Teilen-Menü (Drucken, In Dateien sichern, AirDrop …), sonst als Download. */
export async function dateiTeilen(daten: Uint8Array, name: string, typ: string): Promise<"geteilt" | "geladen" | "abgebrochen"> {
  const datei = new File([daten as BlobPart], name, { type: typ });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [datei] })) {
    try { await nav.share({ files: [datei], title: name }); return "geteilt"; }
    catch (e) { if ((e as Error)?.name === "AbortError") return "abgebrochen"; /* sonst Download versuchen */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(datei); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return "geladen";
}

"use client";
/* Schadenfall vom Gerät aus. Beschreibung, Dinge und Seiten werden hier gegen die Schwärzliste ersetzt.
   Je Police, die am Schadentag galt, EIN KI-Aufruf mit Steckbrief der damaligen Fassung und passenden Seiten (Volltextsuche).
   Fotos gehen nie an die KI. Antworten werden über das Regelmodul abgesichert und erneut gegen die Liste geprüft. */
import { supabaseBrowser } from "@/lib/supabase/browser";
import { anonymisieren } from "@/lib/schwaerzen";
import { listenTreffer } from "@/lib/schwaerzen/seitentext";
import type { ListenEintrag } from "@/lib/schwaerzen/liste";
import { textSauber } from "@/lib/ki/antwort";
import { pruefungAus, type Pruefung } from "@/lib/ki/schaden";
import type { Akte } from "@/lib/akte/abbilden";
import * as R from "@/lib/regeln";

export type SchadenErfassung = { datum: string; titel: string; beschreibung: string; dingIds: string[] };

export async function schadenPruefen(haushaltId: string, akte: Akte, e: SchadenErfassung, liste: ListenEintrag[], status: (t: string) => void) {
  const weg = (t: string) => textSauber(anonymisieren(t, liste).text);
  const beschreibung = weg(e.beschreibung.trim());
  const dinge = e.dingIds.map((id) => weg(String(akte.dinge.find((d) => d.id === id)?.name ?? ""))).filter(Boolean);
  const policen = R.schadenPolicen(akte, e.datum) as Record<string, unknown>[];
  const sb = supabaseBrowser();
  let kosten = 0, warnung = "";
  const titel = (id: string) => weg(String(akte.dokumente.find((d) => d.id === id)?.titel ?? "Dokument"));

  const pruefungen: Pruefung[] = [];
  for (const [i, p] of policen.entries()) {
    status(`Police ${i + 1} von ${policen.length} wird geprüft: ${String(p.kurzname)} …`);
    if (!p.steckbrief) { pruefungen.push(pruefungAus(p, null)); continue; }
    const doks = akte.dokumente.filter((d) => d.vertragId === p.vertragId).map((d) => d.id);
    let seiten: { titel: string; nr: number; text: string }[] = [];
    if (doks.length) {
      const r = await sb.rpc("seiten_suchen", { p_haushalt: haushaltId, p_frage: beschreibung + " " + dinge.join(" "), p_max: 6, p_dokumente: doks });
      seiten = ((r.data ?? []) as { dokument_id: string; nr: number; text: string }[]).map((x) => ({ titel: titel(x.dokument_id), nr: x.nr, text: weg(x.text) }));
    }
    const res = await fetch("/api/ki/schaden", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ haushaltId, schaden: { datum: e.datum, beschreibung, dinge }, police: { kurzname: weg(String(p.kurzname)), firma: p.firma ? weg(String(p.firma)) : null, steckbriefVon: p.steckbriefVon, steckbrief: R.tief(p.steckbrief, weg), seiten } }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const u = pruefungAus({ ...p, steckbrief: null }, null);
      pruefungen.push({ ...u, begruendung: "Prüfung durch die KI nicht möglich: " + (j.fehler ?? "unbekannter Fehler") + " Bitte selbst in den Bedingungen nachsehen." });
      continue;
    }
    kosten += Number(j.kostenCent) || 0;
    let pr = pruefungAus(p, j.ergebnis);
    if (listenTreffer(JSON.stringify(pr), liste).length) {
      warnung = "Achtung: Eine Antwort enthielt Angaben aus der Schwärzliste. Die Stellen wurden ersetzt.";
      pr = R.tief(pr, (t: string) => anonymisieren(t, liste).text) as Pruefung;
    }
    pruefungen.push(pr);
  }
  return { beschreibung, titel: weg(e.titel.trim()), pruefungen, kostenCent: kosten, warnung };
}

export async function schadenAnlegen(haushaltId: string, e: { datum: string; titel: string; beschreibung: string }, dingIds: string[], pruefungen: Pruefung[]): Promise<string> {
  const { data, error } = await supabaseBrowser().rpc("schaden_speichern", {
    p_haushalt_id: haushaltId, p_schaden: e, p_dinge: dingIds,
    p_pruefungen: pruefungen.map((p) => ({
      vertrag_id: p.vertragId, greift: p.greift, andere_sparte: !!p.andereSparte, begruendung: p.begruendung, fundstellen: p.fundstellen, ausschluesse: p.ausschluesse,
      selbstbeteiligung: p.selbstbeteiligung, pflichten: p.pflichten, fristen: p.fristen, offene_fragen: p.offeneFragen, fassung_von: p.fassungVon, dokument_id: p.dokumentId, steckbrief_von: p.steckbriefVon,
    })),
  });
  if (error || !data) throw new Error("Der Schadenfall konnte nicht gespeichert werden.");
  return String(data);
}

/** Schadenfoto: verkleinert als JPEG in den privaten Bucket, dann Eintrag; schlägt der Eintrag fehl, wird die Datei wieder entfernt. */
export async function fotoHochladen(haushaltId: string, schadenId: string, datei: File): Promise<string | null> {
  const bild = await createImageBitmap(datei);
  const k = Math.min(1, 1600 / Math.max(bild.width, bild.height)), c = document.createElement("canvas");
  c.width = Math.round(bild.width * k); c.height = Math.round(bild.height * k);
  c.getContext("2d")!.drawImage(bild, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.8));
  if (!blob) return "Das Foto konnte nicht gelesen werden.";
  const id = crypto.randomUUID(), pfad = `${haushaltId}/${schadenId}/${id}.jpg`, sb = supabaseBrowser();
  const up = await sb.storage.from("schadenfotos").upload(pfad, blob, { contentType: "image/jpeg" });
  if (up.error) return "Das Foto konnte nicht hochgeladen werden.";
  const { error } = await sb.from("schaden_fotos").insert({ id, haushalt_id: haushaltId, schaden_id: schadenId, pfad });
  if (error) { await sb.storage.from("schadenfotos").remove([pfad]); return "Das Foto konnte nicht gespeichert werden."; }
  return null;
}

/** Sofortmaßnahmen und Hotlines für den Notfall auf dem Gerät merken (offline lesbar über /notfall.html). Nur Firmendaten. */
export function hotlinesAus(akte: Akte) {
  return akte.vertraege.filter((v) => R.istVers(v) && R.laeuft(v)).map((v) => {
    const f = akte.firmen.find((x) => x.id === v.firmaId);
    return { vertrag: String(v.kurzname ?? ""), firma: String(f?.name ?? ""), nummer: String(f?.hotline ?? f?.telefon ?? "") };
  }).filter((h) => h.nummer);
}
export function notfallMerken(akte: Akte) {
  try { localStorage.setItem("notfall", JSON.stringify({ sofort: R.sofortListe(akte.einst), hotlines: hotlinesAus(akte), stand: R.heute() })); } catch { /* ohne Speicher */ }
}

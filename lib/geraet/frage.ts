"use client";
/* Frag die Akte vom Gerät aus. Frage, Einträge und Seiten werden hier gegen die Schwärzliste ersetzt, bevor etwas den Browser verlässt.
   1. Seiten per Volltextsuche (ohne KI)  2. nur wenn nichts gefunden: KI wählt Seiten aus dem Verzeichnis  3. KI antwortet mit Quellen.
   Die Antwort wird hier erneut gegen die Schwärzliste geprüft; Namen setzt erst die Anzeige ein. */
import { supabaseBrowser } from "@/lib/supabase/browser";
import { anonymisieren } from "@/lib/schwaerzen";
import { listenTreffer } from "@/lib/schwaerzen/seitentext";
import type { ListenEintrag } from "@/lib/schwaerzen/liste";
import { textSauber } from "@/lib/ki/antwort";
import { frageKontext, frageVerzeichnis, stichtagAus, verweise, type FrageSeite } from "@/lib/ki/frage";
import type { Akte, Eintrag } from "@/lib/akte/abbilden";
import * as R from "@/lib/regeln";

export type FrageErgebnis = { frage: string; antwort: string; stichtag: string; gelesen: { dokumentId: string; titel: string; nr: number }[]; kostenCent: number; warnung?: string };

async function senden(body: Record<string, unknown>) {
  const r = await fetch("/api/ki/frage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.fehler ?? "Die KI ist gerade nicht erreichbar.");
  return j;
}

export async function fragen(haushaltId: string, frageRoh: string, liste: ListenEintrag[], akte: Akte, status: (t: string) => void): Promise<FrageErgebnis> {
  const heute = R.heute();
  const weg = (t: string) => textSauber(anonymisieren(t, liste).text);
  const frage = weg(frageRoh.trim());
  let stichtag = stichtagAus(frage, heute);
  const datumGenannt = stichtag !== heute;
  const doks = new Map(akte.dokumente.map((d) => [d.id, d] as [string, Eintrag]));
  const { hin, zurueck } = verweise([...doks.keys()]);
  const inKraft = (dokumentId: string, tag: string) => {
    const d = doks.get(dokumentId), v = d?.vertragId ? akte.vertraege.find((x) => x.id === d.vertragId) : null;
    return !!d && (!v || R.aktivAm(v, akte.fassungen, tag));
  };
  const sb = supabaseBrowser();
  let kosten = 0;

  status("Die Akte wird durchsucht …");
  const s = await sb.rpc("seiten_suchen", { p_haushalt: haushaltId, p_frage: frage });
  if (s.error) throw new Error("Die Suche in den Dokumenten hat nicht geklappt.");
  let roh = ((s.data ?? []) as { dokument_id: string; nr: number; text: string }[]).filter((x) => inKraft(x.dokument_id, stichtag));

  if (!roh.length && doks.size) {
    status("Nichts direkt gefunden – die KI sucht passende Seiten aus …");
    const a = await senden({ haushaltId, schritt: "auswahl", frage, verzeichnis: R.tief(frageVerzeichnis(akte, hin), weg) });
    kosten += Number(a.kostenCent) || 0;
    const wahl = a.auswahl && typeof a.auswahl === "object" ? a.auswahl as { stichtag?: unknown; seiten?: { dokumentId?: unknown; seiten?: unknown }[] } : {};
    const seitenWahl = Array.isArray(wahl.seiten) ? wahl.seiten.map((w) => ({ ...w, dokumentId: zurueck.get(String(w?.dokumentId)) ?? null })) : [];
    const w = R.seitenWunsch({ stichtag: datumGenannt ? stichtag : wahl.stichtag, seiten: seitenWahl }, akte, heute);
    stichtag = w.stichtag;
    const wunsch = (w.seiten as { dokumentId: string; seiten: number[] }[]).filter((x) => inKraft(x.dokumentId, stichtag));
    if (wunsch.length) {
      const z = await sb.from("dokument_seiten").select("dokument_id, nr, text").eq("haushalt_id", haushaltId).in("dokument_id", wunsch.map((x) => x.dokumentId));
      if (z.error) throw new Error("Die Seiten konnten nicht geladen werden.");
      roh = (z.data ?? []).filter((x) => wunsch.some((y) => y.dokumentId === x.dokument_id && y.seiten.includes(x.nr)));
    }
  }

  const titel = (id: string) => String(doks.get(id)?.titel ?? doks.get(id)?.typ ?? "Dokument");
  const seiten: FrageSeite[] = roh.map((x) => ({ titel: weg(titel(x.dokument_id)), nr: x.nr, text: weg(x.text) }));
  const kontext = R.tief(frageKontext(akte, stichtag, heute, hin), weg);

  status(seiten.length ? `${seiten.length} ${seiten.length === 1 ? "Seite wird" : "Seiten werden"} nachgeschlagen, die Antwort wird geschrieben …` : "Die Antwort wird geschrieben …");
  const j = await senden({ haushaltId, schritt: "antwort", frage, stichtag, kontext, seiten });
  kosten += Number(j.kostenCent) || 0;

  let antwort = textSauber(String(j.antwort ?? ""));
  let warnung: string | undefined;
  if (listenTreffer(antwort, liste).length) {
    warnung = "Achtung: Die Antwort enthielt Angaben aus eurer Schwärzliste. Die Stellen wurden ersetzt; bitte die gespeicherten Seiten prüfen.";
    antwort = anonymisieren(antwort, liste).text;
  }
  return { frage, antwort, stichtag, gelesen: roh.map((x) => ({ dokumentId: x.dokument_id, titel: titel(x.dokument_id), nr: x.nr })), kostenCent: kosten, warnung };
}

/** „Für Tochter“: zweiter Aufruf mit der geschwärzten Frage und Antwort; Ergebnis wieder gegen die Liste geprüft. */
export async function tochterFassung(haushaltId: string, erg: FrageErgebnis, liste: ListenEintrag[]): Promise<{ text: string; kostenCent: number; warnung?: string }> {
  const j = await senden({ haushaltId, schritt: "tochter", frage: erg.frage, antwort: erg.antwort });
  let text = textSauber(String(j.antwort ?? ""));
  let warnung: string | undefined;
  if (listenTreffer(text, liste).length) { warnung = "Die Umformulierung enthielt Angaben aus der Schwärzliste; sie wurden ersetzt."; text = anonymisieren(text, liste).text; }
  return { text, kostenCent: Number(j.kostenCent) || 0, warnung };
}

/** „Zur Akte“: nur Platzhalter-Fassung speichern. */
export async function frageSpeichern(haushaltId: string, erg: FrageErgebnis, tochter: string | null, liste: ListenEintrag[]): Promise<string | null> {
  const weg = (t: string) => textSauber(anonymisieren(t, liste).text);
  const { error } = await supabaseBrowser().from("fragen").insert({
    haushalt_id: haushaltId, frage: weg(erg.frage), antwort: weg(erg.antwort), tochter: tochter ? weg(tochter) : null, stichtag: erg.stichtag,
    quellen: erg.gelesen.map((g) => ({ dokumentId: g.dokumentId, nr: g.nr })),
  });
  return error ? "Konnte nicht gespeichert werden." : null;
}

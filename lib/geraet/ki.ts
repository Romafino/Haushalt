"use client";
/* KI-Auslesen vom Gerät aus: nur geschwärzte Bilder und geschwärzter Text gehen an den Server.
   Die Antwort wird im Browser ein zweites Mal geprüft: bereinigen (wie auf dem Server) und Abgleich mit der Schwärzliste. */
import { seitenText, listenTreffer } from "@/lib/schwaerzen/seitentext";
import { anonymisieren } from "@/lib/schwaerzen";
import type { ListenEintrag } from "@/lib/schwaerzen/liste";
import { vorschlagAus } from "@/lib/ki/antwort";
import type { Vorschlag } from "@/lib/ki/uebernahme";
import type { Akte } from "@/lib/akte/abbilden";
import * as R from "@/lib/regeln";
import { balkenZeichnen, type Seite } from "./seiten";

const MAX_BILDER = 6;

/** Geschwärzte Seite verkleinert als JPEG (Base64), damit die Anfrage klein bleibt. */
async function kleinesBild(s: Seite): Promise<string> {
  const k = Math.min(1, 1400 / Math.max(s.c.width, s.c.height)), c = document.createElement("canvas");
  c.width = Math.round(s.c.width * k); c.height = Math.round(s.c.height * k);
  const g = c.getContext("2d")!;
  g.drawImage(s.c, 0, 0, c.width, c.height);
  for (const b of s.balken) balkenZeichnen(g, b, k, true);
  return c.toDataURL("image/jpeg", 0.7).split(",")[1];
}

export type KiAntwort = { vorschlag: Vorschlag; kostenCent: number; limit: { verbrauchtCent: number; limitCent: number; warnung: boolean }; warnung?: string };

export async function kiAuslesen(haushaltId: string, seiten: Seite[], liste: ListenEintrag[], akte: Akte): Promise<KiAntwort> {
  const texte = seiten.map((s, i) => ({ nr: i + 1, text: seitenText(s.stuecke, s.balken, liste) }));
  if (texte.some((t) => listenTreffer(t.text, liste).length)) throw new Error("Im Text steht noch etwas aus der Schwärzliste. Bitte nachschwärzen.");
  const bilder = await Promise.all(seiten.slice(0, MAX_BILDER).map(kleinesBild));
  const r = await fetch("/api/ki/dokument", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ haushaltId, seiten: texte, bilder }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.fehler ?? "Die KI ist gerade nicht erreichbar.");

  // zweite Prüfung im Browser: gleiche Bereinigung wie auf dem Server, dann gegen die entschlüsselte Schwärzliste
  const ids = { vertraege: akte.vertraege.map((v) => v.id), dinge: akte.dinge.map((d) => d.id), firmen: akte.firmen.map((f) => f.id) };
  let vorschlag = vorschlagAus(j.vorschlag, ids) as Vorschlag;
  const roh = JSON.stringify(vorschlag);
  const gefunden = listenTreffer(roh, liste);
  let warnung: string | undefined;
  if (gefunden.length) {
    warnung = "Achtung: Die Antwort der KI enthielt Angaben aus eurer Schwärzliste. Die KI hat also etwas Ungeschwärztes gesehen. Die Stellen wurden ersetzt; bitte die Seiten prüfen und nachschwärzen.";
    vorschlag = R.tief(vorschlag, (t: string) => anonymisieren(t, liste).text) as Vorschlag;
  }
  if (seiten.length > MAX_BILDER) warnung = (warnung ? warnung + " " : "") + `Nur die ersten ${MAX_BILDER} Seiten gingen als Bild mit; der Text aller Seiten wurde gesendet.`;
  return { vorschlag, kostenCent: j.kostenCent, limit: j.limit, warnung };
}

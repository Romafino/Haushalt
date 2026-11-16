"use client";
/* KI-Auslesen vom Gerät aus: nur geschwärzte Bilder und geschwärzter Text gehen an den Server.
   Die Antwort wird im Browser ein zweites Mal geprüft: bereinigen (wie auf dem Server) und Abgleich mit der Schwärzliste. */
import { seitenText, listenTreffer } from "@/lib/schwaerzen/seitentext";
import { anonymisieren } from "@/lib/schwaerzen";
import type { ListenEintrag } from "@/lib/schwaerzen/liste";
import { vorschlagAus } from "@/lib/ki/antwort";
import { seitenInGrenze } from "@/lib/ki/prompt";
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
  let bilder = await Promise.all(seiten.slice(0, MAX_BILDER).map(kleinesBild));
  // Anfrage unter der Größengrenze des Servers halten (4,2 MB): notfalls weniger Bilder mitschicken, der Text hat Vorrang
  const groesse = () => new Blob([JSON.stringify({ haushaltId, seiten: texte, bilder })]).size;
  while (bilder.length > 1 && groesse() > 4_000_000) bilder = bilder.slice(0, -1);
  if (groesse() > 4_100_000) throw new Error("Das Dokument ist für einen KI-Aufruf zu groß. Bitte in Teilen aufnehmen (z. B. Bedingungen Teil 1 und Teil 2).");
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
  const gelesen = seitenInGrenze(texte);
  if (gelesen < texte.length) warnung = (warnung ? warnung + " " : "") + `Achtung: Das Dokument ist sehr lang. Die KI hat nur den Text von Seite 1 bis ${gelesen} von ${texte.length} gelesen; Angaben auf späteren Seiten fehlen im Vorschlag und im Steckbrief. Gespeichert und durchsuchbar sind trotzdem alle Seiten. Für eine vollständige Auswertung den Rest als eigenes Dokument aufnehmen.`;
  if (seiten.length > bilder.length) warnung = (warnung ? warnung + " " : "") + `Als Bild gingen die ersten ${bilder.length} Seiten mit; vom Rest nur der Text.`;
  return { vorschlag, kostenCent: j.kostenCent, limit: j.limit, warnung };
}

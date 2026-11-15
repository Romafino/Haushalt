"use client";
/* Gerätearbeit (nur im Browser): PDF/Fotos laden, Texterkennung, Balken einbrennen.
   Nichts davon verlässt das Gerät. Übernommen aus altbestand/schwaerzer/app.js (laden, bildLaden, erkennen, balken, flach). */
import type { Balken, Stueck } from "@/lib/schwaerzen/seitentext";

export type Seite = { c: HTMLCanvasElement; stuecke: Stueck[] | null; balken: Balken[] };
type Status = (text: string) => void;

const istPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");

async function bildLaden(file: File): Promise<HTMLCanvasElement> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    src = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image(), u = URL.createObjectURL(file);
      i.onload = () => { URL.revokeObjectURL(u); ok(i); };
      i.onerror = () => { URL.revokeObjectURL(u); no(new Error("Bild nicht lesbar")); };
      i.src = u;
    });
  }
  const k = Math.min(1, 2400 / Math.max(src.width, src.height)), c = document.createElement("canvas");
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** PDF (Textebene wird übernommen) oder Fotos laden. Höchstens 60 Seiten. */
export async function dateienLaden(files: File[], status: Status): Promise<{ seiten: Seite[]; quelle: "pdf" | "foto" }> {
  const pdf = files.find(istPdf);
  if (pdf && files.length > 1) throw new Error("Bitte entweder ein PDF oder Fotos wählen.");
  if (!pdf) {
    const seiten: Seite[] = [];
    for (let i = 0; i < files.length; i++) {
      status(`Foto ${i + 1} von ${files.length} wird vorbereitet …`);
      seiten.push({ c: await bildLaden(files[i]), stuecke: null, balken: [] });
    }
    return { seiten, quelle: "foto" };
  }
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  const doc = await lib.getDocument({ data: await pdf.arrayBuffer() }).promise;
  if (doc.numPages > 60) throw new Error("Mehr als 60 Seiten. Bitte in Teilen bearbeiten.");
  const seiten: Seite[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    status(`Seite ${i} von ${doc.numPages} wird vorbereitet …`);
    const page = await doc.getPage(i), vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(3, 1700 / vp0.width) });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    const tc = await page.getTextContent(), stuecke: Stueck[] = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str) continue;
      const hgt = it.height || Math.hypot(it.transform[2], it.transform[3]) || 10;
      // pdf.js 6: Rechteck über zwei Eckpunkte umrechnen (convertToViewportRectangle gibt es nicht mehr)
      const p1 = vp.convertToViewportPoint(it.transform[4], it.transform[5] - hgt * 0.22), p2 = vp.convertToViewportPoint(it.transform[4] + it.width, it.transform[5] + hgt * 0.92);
      const r = [p1[0], p1[1], p2[0], p2[1]] as number[];
      stuecke.push({ str: it.str, x0: Math.min(r[0], r[2]), x1: Math.max(r[0], r[2]), y0: Math.min(r[1], r[3]), y1: Math.max(r[1], r[3]) });
    }
    seiten.push({ c, stuecke: stuecke.length > 3 ? stuecke : null, balken: [] });
  }
  return { seiten, quelle: "pdf" };
}

/* Texterkennung auf dem Gerät. Engine und Sprachdaten liefert die App selbst aus (public/vendor). */
let ocrWorker: Promise<import("tesseract.js").Worker> | null = null;
async function ocr() {
  if (!ocrWorker) {
    ocrWorker = import("tesseract.js").then((T) => T.createWorker("deu", 1, {
      workerPath: "/vendor/tesseract/worker.min.js", corePath: "/vendor/tesseract/core", langPath: "/vendor/tesseract/lang",
      gzip: true, cacheMethod: "none", workerBlobURL: false,
    }));
    ocrWorker.catch(() => { ocrWorker = null; });
  }
  return ocrWorker;
}

/** Erkennt Wörter auf allen Seiten ohne Textebene. */
export async function erkennen(seiten: Seite[], status: Status): Promise<void> {
  const offen = seiten.filter((s) => !s.stuecke);
  if (!offen.length) return;
  status("Texterkennung wird geladen …");
  const w = await ocr();
  for (let i = 0; i < offen.length; i++) {
    status(`Texterkennung: Seite ${seiten.indexOf(offen[i]) + 1} (${i + 1} von ${offen.length}) …`);
    const r = await w.recognize(offen[i].c, {}, { blocks: true });
    const woerter = (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
    offen[i].stuecke = woerter.map((x) => ({ str: x.text, x0: x.bbox.x0, x1: x.bbox.x1, y0: x.bbox.y0, y1: x.bbox.y1 }));
  }
}

/** Balken zeichnen (schwarz, Platzhalter weiß darin). k = Maßstab Anzeige/Original. */
export function balkenZeichnen(g: CanvasRenderingContext2D, b: Balken, k: number, mitText: boolean) {
  const x = b.x * k, y = b.y * k, w = b.w * k, hh = b.h * k;
  g.fillStyle = "#000"; g.fillRect(x, y, w, hh);
  if (!mitText || !b.label || w < 8 || hh < 6) return;
  let gr = hh * 0.72; g.font = "bold " + gr + "px sans-serif";
  const tw = g.measureText(b.label).width;
  if (tw > w * 0.94) { gr *= (w * 0.94) / tw; g.font = "bold " + gr + "px sans-serif"; }
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(b.label, x + w / 2, y + hh / 2);
}

/** Seite mit eingebrannten Balken als JPEG. Das Original bleibt nur im Speicher dieser Seite. */
export async function geschwaerztesBild(s: Seite): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = s.c.width; c.height = s.c.height;
  const g = c.getContext("2d")!;
  g.drawImage(s.c, 0, 0);
  for (const b of s.balken) balkenZeichnen(g, b, 1, true);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Bild konnte nicht erzeugt werden"))), "image/jpeg", 0.82));
}

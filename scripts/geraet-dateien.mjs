// Kopiert die Dateien für Texterkennung (tesseract.js) und PDF (pdf.js) nach public/vendor, damit die App sie
// selbst ausliefert: Beim Erkennen werden keine fremden Server angefragt. Läuft nach npm install und vor dem Build.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const nm = join(import.meta.dirname, "..", "node_modules");
const ziel = join(import.meta.dirname, "..", "public", "vendor");
const kopie = (von, nach) => { mkdirSync(join(ziel, nach, ".."), { recursive: true }); cpSync(join(nm, von), join(ziel, nach)); };

if (!existsSync(join(nm, "tesseract.js"))) { console.log("geraet-dateien: node_modules fehlt, übersprungen"); process.exit(0); }
kopie("tesseract.js/dist/worker.min.js", "tesseract/worker.min.js");
for (const f of readdirSync(join(nm, "tesseract.js-core")).filter((f) => /^tesseract-core.*\.(js|wasm)$/.test(f))) kopie("tesseract.js-core/" + f, "tesseract/core/" + f);
kopie("@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz", "tesseract/lang/deu.traineddata.gz");
kopie("pdfjs-dist/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs");
console.log("geraet-dateien: kopiert nach public/vendor");

// Führt die Tests des Altbestands (altbestand/tests/test_*.js) mit Node aus.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ordner = join(import.meta.dirname, "..", "altbestand", "tests");
let fehler = 0;
for (const datei of readdirSync(ordner).filter((d) => /^test_.*\.js$/.test(d)).sort()) {
  const r = spawnSync(process.execPath, [join(ordner, datei)], { encoding: "utf8" });
  const ok = (r.stdout.match(/^ok/gm) || []).length;
  console.log(`${r.status === 0 ? "grün" : "ROT "}  ${datei} (${ok} Prüfungen)`);
  if (r.status !== 0) { fehler++; console.log(r.stderr || r.stdout); }
}
process.exit(fehler ? 1 : 0);

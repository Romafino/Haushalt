import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    // Datenbanktests teilen sich eine Testdatenbank: nacheinander ausführen.
    fileParallelism: false,
  },
});

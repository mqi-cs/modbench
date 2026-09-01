import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // Pass measure 4 scopes the >=90% line coverage requirement to
      // lib/compat -- the pure engine. Scripts and the DB layer are
      // excluded deliberately: they're I/O pipelines exercised by running
      // them against the real catalog (verify-catalog.ts is itself the
      // check for those), not by unit tests.
      include: ["lib/compat/**/*.ts"],
      exclude: ["lib/compat/__tests__/**"],
      thresholds: { lines: 90 },
      reporter: ["text-summary"],
    },
  },
});

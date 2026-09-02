import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws on import outside a React Server Component.
      // Tests of server modules (loadCatalog, buildView, the style-build
      // fixtures) are exercising exactly the server path, so the guard is
      // stubbed rather than the modules being restructured to avoid it.
      "server-only": fileURLToPath(new URL("./lib/db/server-only-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
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

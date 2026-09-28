// Side-effect import for tests that write to the database: points
// lib/db/client.ts at a throwaway copy, so `pnpm check` never modifies the
// committed data/modbench.db. Import it before anything that loads the client.
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "modbench-test-"));
copyFileSync("data/modbench.db", join(dir, "modbench.db"));
process.env.MODBENCH_DB = join(dir, "modbench.db");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

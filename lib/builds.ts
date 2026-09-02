import "server-only";
import { customAlphabet } from "nanoid";
import { eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { builds, rateLimits } from "./db/schema";
import { fromJsonColumn } from "./db/json";
import type { Build, CatalogSlice, SlotKey } from "./compat";
import { evaluateBuild } from "./compat";
import { partById } from "./compat/types";

// URL-safe, no lookalikes. A shared link gets read aloud and retyped from
// screenshots, so 0/O and 1/l/I are left out rather than trusted.
const ALPHABET = "23456789abcdefghijkmnopqrstuvwxyz";
const newId = customAlphabet(ALPHABET, 8);

export const SLOT_KEYS: SlotKey[] = [
  "movement", "case", "dial", "hands", "chapterRing", "bezel", "bezelInsert", "crystal", "crown", "strap",
];

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string; findings?: string[] };

/**
 * Validates a slot map against the catalog and saves it.
 *
 * specs/06-phase-5-sharing.md: "Reject builds that evaluate to `blocked` --
 * never mint a permalink for a build that can't be made." A permalink is a
 * claim that outlives the session that made it, so it has to be re-checked
 * here rather than trusted from the client: the configurator's own
 * verdict is not evidence, since anything can POST to this endpoint.
 */
export function saveBuild(raw: unknown, catalog: CatalogSlice): SaveResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, status: 400, error: "Expected an object of slot names to part ids." };
  }
  const slots: Partial<Record<SlotKey, string>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SLOT_KEYS.includes(key as SlotKey)) {
      return { ok: false, status: 400, error: `"${key}" is not a build slot.` };
    }
    if (typeof value !== "string") {
      return { ok: false, status: 400, error: `Slot "${key}" must be a part id.` };
    }
    // partById, not a bare lookup: ids arrive from the network, and
    // catalog.parts is a plain object, so "__proto__" would otherwise
    // resolve to something inherited and pass for a real part.
    if (!partById(catalog, value)) {
      return { ok: false, status: 400, error: `No approved part with id "${value}".` };
    }
    const part = partById(catalog, value)!;
    if (part.slot !== key) {
      return { ok: false, status: 400, error: `"${part.name}" is a ${part.slot}, not a ${key}.` };
    }
    slots[key as SlotKey] = value;
  }
  if (Object.keys(slots).length === 0) {
    return { ok: false, status: 400, error: "An empty build has nothing to share." };
  }

  const build: Build = { parts: slots };
  const result = evaluateBuild(build, catalog);
  if (result.status === "blocked") {
    return {
      ok: false,
      status: 422,
      error: "This build has parts that don't fit together, so it can't be given a permanent link.",
      findings: result.findings.filter((f) => f.severity === "error").map((f) => f.message),
    };
  }

  // Retry on collision rather than assuming 8 chars is enough. At 33^8
  // the odds are remote, but "remote" is not "checked", and the failure
  // would be silently serving someone else's build.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId();
    if (db.select({ id: builds.id }).from(builds).where(eq(builds.id, id)).get()) continue;
    db.insert(builds).values({ id, slots: JSON.stringify(slots), createdAt: Date.now(), viewCount: 0 }).run();
    return { ok: true, id };
  }
  return { ok: false, status: 503, error: "Couldn't allocate a link. Try again." };
}

export interface SavedBuild {
  id: string;
  slots: Partial<Record<SlotKey, string>>;
  createdAt: number;
  viewCount: number;
}

export function loadBuild(id: string): SavedBuild | null {
  if (!/^[23456789abcdefghijkmnopqrstuvwxyz]{8}$/.test(id)) return null;
  const row = db.select().from(builds).where(eq(builds.id, id)).get();
  if (!row) return null;
  return {
    id: row.id,
    slots: fromJsonColumn<Partial<Record<SlotKey, string>>>(row.slots),
    createdAt: row.createdAt,
    viewCount: row.viewCount,
  };
}

export function recordView(id: string): void {
  db.update(builds).set({ viewCount: sql`${builds.viewCount} + 1` }).where(eq(builds.id, id)).run();
}

export const RATE_LIMIT_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Fixed-window limiter keyed on caller identity.
 *
 * Stored in the database, not in a module-level Map: the dev server and
 * any serverless deployment both lose in-process state between requests,
 * so an in-memory limiter would reset on every cold start and limit
 * nothing.
 */
export function checkRateLimit(key: string, now = Date.now(), limit = RATE_LIMIT_PER_HOUR): boolean {
  const row = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
  if (!row || now - row.windowStart >= WINDOW_MS) {
    db.insert(rateLimits).values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({ target: rateLimits.key, set: { windowStart: now, count: 1 } }).run();
    return true;
  }
  if (row.count >= limit) return false;
  db.update(rateLimits).set({ count: row.count + 1 }).where(eq(rateLimits.key, key)).run();
  return true;
}

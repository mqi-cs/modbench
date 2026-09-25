import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { fromJsonColumn } from "../../db/json";
import { parts } from "../../db/schema";
import { caseSeatR, mm, watchMm } from "../art/geometry";
import { caseDimensions } from "../dimensions";

// WS0 step 1: the seat used to come from the insert's 38mm default, so on
// the 37.8mm case set it sat outside the case and the rim vanished.
describe("bezel seat", () => {
  const cases = db
    .select()
    .from(parts)
    .where(and(eq(parts.category, "case"), eq(parts.reviewState, "approved")))
    .all();

  it("reads the approved cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it("sits inside the case chamfer for every approved case, with or without an insert", () => {
    const offenders = cases.filter((p) => {
      const caseMm = caseDimensions(fromJsonColumn<Record<string, unknown>>(p.attributes));
      const chamferR = mm(watchMm({ case: caseMm }).caseDiameter) / 2 - mm(1.0);
      return [watchMm({ case: caseMm }), watchMm({ case: caseMm, insert: { outer: 38 } })].some(
        (m) => caseSeatR(m) >= chamferR,
      );
    });
    expect(offenders.map((p) => p.name)).toEqual([]);
  });
});

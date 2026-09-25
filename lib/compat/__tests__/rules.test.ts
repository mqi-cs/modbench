// Per-rule unit tests: every rule, both its firing and non-firing branch,
// against hand-built minimal fixtures (no database).
import { describe, expect, it } from "vitest";
import { buildOf, catalogOf, part, severities } from "./helpers";

import { movementCaseFit } from "../rules/movement-case-fit";
import { dialMovementFeet } from "../rules/dial-movement-feet";
import { dialCaseDiameter } from "../rules/dial-case-diameter";
import { nh34HandStack } from "../rules/nh34-hand-stack";
import { dateWindowAlignment } from "../rules/date-window-alignment";
import { dayWindowPresence } from "../rules/day-window-presence";
import { insertCaseFit } from "../rules/insert-case-fit";
import { crystalCaseFit } from "../rules/crystal-case-fit";
import { chapterRingFit } from "../rules/chapter-ring-fit";
import { handStackClearance } from "../rules/hand-stack-clearance";
import { familyException } from "../rules/family-exception";
import { unverifiedPart } from "../rules/unverified-part";
import { lumeMismatch } from "../rules/lume-mismatch";
import { stockAvailability } from "../rules/stock-availability";
import { multiVendorShipping } from "../rules/multi-vendor-shipping";
import { dialMovementSize } from "../rules/dial-movement-size";
import { crownStemLength } from "../rules/crown-stem-length";
import { deriveTools } from "../tools";
import { bezelCaseFit } from "../rules/bezel-case-fit";
import { crownCaseFit } from "../rules/crown-case-fit";
import { strapFit } from "../rules/strap-fit";
import { insertCrystalProfileFit } from "../rules/insert-crystal-profile-fit";
import { dialCaseModelExclusion } from "../rules/dial-case-model-exclusion";

const NH35 = { caliber: "NH35", hasDay: false, hasDate: true, dateWindowPosition: null };
const NH36 = { caliber: "NH36", hasDay: true, hasDate: true, dateWindowPosition: null };
const NH34 = { caliber: "NH34", hasDay: false, hasDate: true, dateWindowPosition: null };
const PLAIN_DIAL = { hasFeet: true, diameterMm: 28.5, hasDateWindow: true, hasDayWindow: false, hasSubdials: false, supportedDatePositions: null, incompatibleCaseFamilies: [] as string[], lumed: null };
const SKX007_CASE = { caseDiameterMm: 42.5, lugWidthMm: 22, dialApertureMm: 28.5, crystalDiameterMm: 31.5, crownPosition: "3.8" };

function run(rule: { evaluate: (b: never, c: never) => unknown[] }, parts: ReturnType<typeof part>[], extra = {}) {
  const catalog = catalogOf(parts, extra) as never;
  return rule.evaluate(buildOf(parts) as never, catalog) as { ruleKey: string; severity: string }[];
}

describe("movement-case-fit", () => {
  it("errors when a movement spare part fills the movement slot", () => {
    const f = run(movementCaseFit, [part("movement", "nh3x-movement-accessory"), part("case", "skx007-case", SKX007_CASE)]);
    expect(severities(f)).toEqual(["error"]);
  });
  it("does not fire for a complete movement, including VK6x in an NH-family case", () => {
    expect(run(movementCaseFit, [part("movement", "nh3x-movement", NH35), part("case", "skx007-case", SKX007_CASE)])).toHaveLength(0);
    // Regression guard for the falsified premise: VK6x is drop-in in NH cases.
    expect(run(movementCaseFit, [part("movement", "vk6x-movement"), part("case", "skx007-case", SKX007_CASE)])).toHaveLength(0);
  });
});

describe("dial-movement-feet", () => {
  it("errors when a chronograph dial sits over a non-chronograph movement", () => {
    const f = run(dialMovementFeet, [part("dial", "vk6x-dial", { ...PLAIN_DIAL, hasSubdials: true }), part("movement", "nh3x-movement", NH35)]);
    expect(f.some((x) => x.severity === "error")).toBe(true);
  });
  it("only warns when a plain dial sits over a chronograph movement", () => {
    const f = run(dialMovementFeet, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("movement", "vk6x-movement")]);
    expect(f.some((x) => x.severity === "error")).toBe(false);
    expect(f.some((x) => x.severity === "warning")).toBe(true);
  });
  it("warns, never errors, on a feetless dial", () => {
    const f = run(dialMovementFeet, [part("dial", "nh3x-dial-feetless", { ...PLAIN_DIAL, hasFeet: false }), part("movement", "nh3x-movement", NH35)]);
    expect(severities(f)).toContain("warning");
    expect(severities(f)).not.toContain("error");
  });
  it("is silent when dial and movement agree and feet are confirmed", () => {
    expect(run(dialMovementFeet, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("movement", "nh3x-movement", NH35)])).toHaveLength(0);
  });
});

describe("dial-case-diameter", () => {
  it("errors when the dial is larger than the case aperture", () => {
    const f = run(dialCaseDiameter, [part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, diameterMm: 31 }), part("case", "skx007-case", SKX007_CASE)]);
    expect(severities(f)).toEqual(["error"]);
  });
  it("is silent on the universal 28.5mm dial in a 28.5mm aperture", () => {
    expect(run(dialCaseDiameter, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("case", "skx007-case", SKX007_CASE)])).toHaveLength(0);
  });
  it("warns rather than passing when a diameter is missing", () => {
    const f = run(dialCaseDiameter, [part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, diameterMm: null }), part("case", "skx007-case", SKX007_CASE)]);
    expect(severities(f)).toEqual(["warning"]);
  });
});

describe("nh34-hand-stack", () => {
  it("warns (never errors) on an NH34 with non-GMT hands", () => {
    const f = run(nh34HandStack, [part("hands", "nh3x-hands-standard", {}), part("movement", "nh3x-movement", NH34), part("case", "skx007-case", SKX007_CASE)]);
    expect(f.length).toBeGreaterThan(0);
    expect(severities(f)).not.toContain("error");
  });
  it("drops the clearance warning when a double-domed crystal is present", () => {
    const f = run(nh34HandStack, [
      part("hands", "nh3x-hands-standard", { gmt: true }),
      part("movement", "nh3x-movement", NH34),
      part("crystal", "skx007-crystal", { profile: "domed" }, { name: "SKX007 Double Dome Sapphire" }),
    ]);
    expect(f).toHaveLength(0);
  });
  it("warns instead of silently passing when the caliber is unknown", () => {
    const f = run(nh34HandStack, [part("hands", "nh3x-hands-standard", {}), part("movement", "nh3x-movement", { caliber: null })]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("is silent for a plain NH35 with standard hands", () => {
    expect(run(nh34HandStack, [part("hands", "nh3x-hands-standard", {}), part("movement", "nh3x-movement", NH35)])).toHaveLength(0);
  });
});

describe("date-window-alignment", () => {
  it("errors only when movement, case and dial positions are all known and disagree", () => {
    const f = run(dateWindowAlignment, [
      part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, supportedDatePositions: ["3"] }),
      part("movement", "nh3x-movement", { ...NH35, dateWindowPosition: "6" }),
      part("case", "skx007-case", SKX007_CASE),
    ]);
    expect(severities(f)).toEqual(["error"]);
  });
  it("lets the case's crown position explain a movement/dial difference", () => {
    // A 3 o'clock date wheel under a 3.8 crown lands at 3.8: a dial cut
    // there fits. Comparing movement against dial alone would call it a
    // mismatch -- the false positive this rule exists to avoid.
    const f = run(dateWindowAlignment, [
      part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, supportedDatePositions: ["3.8"] }),
      part("movement", "nh3x-movement", { ...NH35, dateWindowPosition: "3" }),
      part("case", "skx007-case", SKX007_CASE),
    ]);
    expect(f).toHaveLength(0);
  });
  it("errors when the crown position moves the date away from a cutout the movement alone would match", () => {
    const f = run(dateWindowAlignment, [
      part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, supportedDatePositions: ["3"] }),
      part("movement", "nh3x-movement", { ...NH35, dateWindowPosition: "3" }),
      part("case", "skx007-case", SKX007_CASE),
    ]);
    expect(severities(f)).toEqual(["error"]);
    expect(JSON.stringify(f)).toContain("about 3:48 o'clock");
  });
  it("reads a movement's date position for the crown case it is sold for (NH36A '3.8 o'clock crown case')", () => {
    const f = run(dateWindowAlignment, [
      part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, supportedDatePositions: ["3"] }),
      part("movement", "nh3x-movement", { ...NH36, dateWindowPosition: "3", crownPosition: "3.8" }),
      part("case", "skx007-case", SKX007_CASE),
    ]);
    expect(f).toHaveLength(0);
  });
  it("reads h:mm positions and wraps past twelve", () => {
    const f = run(dateWindowAlignment, [
      part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, supportedDatePositions: ["12:30"] }),
      part("movement", "nh3x-movement", { ...NH35, dateWindowPosition: "11:42" }),
      part("case", "skx007-case", SKX007_CASE),
    ]);
    expect(f).toHaveLength(0);
  });
  it("warns rather than guesses when a stated position isn't readable", () => {
    const f = run(dateWindowAlignment, [
      part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, supportedDatePositions: ["tilted"] }),
      part("movement", "nh3x-movement", { ...NH35, dateWindowPosition: "3" }),
      part("case", "skx007-case", SKX007_CASE),
    ]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("warns, never errors, when any of the three is unknown", () => {
    const f = run(dateWindowAlignment, [
      part("dial", "nh3x-dial-standard", PLAIN_DIAL), // supportedDatePositions null
      part("movement", "nh3x-movement", { ...NH35, dateWindowPosition: "6" }),
      part("case", "skx007-case", SKX007_CASE),
    ]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("warns about a wasted date function on a dateless dial", () => {
    const f = run(dateWindowAlignment, [part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, hasDateWindow: false }), part("movement", "nh3x-movement", NH35)]);
    expect(severities(f)).toEqual(["warning"]);
  });
});

describe("dial-movement-size (WS1 step 3)", () => {
  it("is silent for a standard-dial caliber", () => {
    expect(run(dialMovementSize, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("movement", "nh3x-movement", NH35)])).toHaveLength(0);
  });
  it("warns, never errors, on a skeleton NH72", () => {
    const f = run(dialMovementSize, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("movement", "nh3x-movement", { caliber: "NH72" })]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("warns when the caliber isn't recorded rather than assuming 28.5mm", () => {
    const f = run(dialMovementSize, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("movement", "nh3x-movement", { caliber: null })]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("leaves VK chronographs and spare parts to their own rules", () => {
    expect(run(dialMovementSize, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("movement", "vk6x-movement")])).toHaveLength(0);
    expect(run(dialMovementSize, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("movement", "nh3x-movement-accessory")])).toHaveLength(0);
  });
});

describe("crown-stem-length and the crystal press (WS1 step 3)", () => {
  it("notes, as info only, that a stem may need cutting", () => {
    expect(severities(run(crownStemLength, [part("crown", "skx007-crown"), part("case", "skx007-case", SKX007_CASE)]))).toEqual(["info"]);
  });
  it("adds a crystal press only when a crystal is bought separately", () => {
    const withCrystal = [part("case", "skx007-case", SKX007_CASE), part("crystal", "skx007-crystal")];
    expect(deriveTools(buildOf(withCrystal), catalogOf(withCrystal))).toContain("crystal-press");
    const without = [part("case", "skx007-case", SKX007_CASE)];
    expect(deriveTools(buildOf(without), catalogOf(without))).not.toContain("crystal-press");
  });
});

describe("day-window-presence", () => {
  it("errors when the dial has a day aperture the movement can't fill", () => {
    const f = run(dayWindowPresence, [part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, hasDayWindow: true }), part("movement", "nh3x-movement", NH35)]);
    expect(severities(f)).toEqual(["error"]);
  });
  it("only warns when a day-date movement sits under a dial with no day aperture", () => {
    const f = run(dayWindowPresence, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("movement", "nh3x-movement", NH36)]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("warns when either side is unknown", () => {
    const f = run(dayWindowPresence, [part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, hasDayWindow: null }), part("movement", "nh3x-movement", NH35)]);
    expect(severities(f)).toEqual(["warning"]);
  });
});

describe("case-shape platform rules", () => {
  const cases: [string, { evaluate: (b: never, c: never) => unknown[] }, ReturnType<typeof part>, ReturnType<typeof part>][] = [
    ["insert-case-fit", insertCaseFit, part("bezelInsert", "skx013-insert"), part("bezelInsert", "skx007-insert")],
    ["crystal-case-fit", crystalCaseFit, part("crystal", "skx013-crystal"), part("crystal", "skx007-crystal")],
    ["chapter-ring-fit", chapterRingFit, part("chapterRing", "skx013-chapter-ring"), part("chapterRing", "skx007-chapter-ring")],
    ["bezel-case-fit", bezelCaseFit, part("bezel", "skx013-bezel"), part("bezel", "skx007-bezel")],
    ["crown-case-fit", crownCaseFit, part("crown", "skx013-crown"), part("crown", "skx007-crown")],
  ];
  for (const [name, rule, mismatched, matched] of cases) {
    it(`${name} fires on a platform mismatch`, () => {
      const f = run(rule, [mismatched, part("case", "skx007-case", SKX007_CASE)]);
      expect(f).toHaveLength(1);
      // chapter-ring-fit is specced as a warning; the rest are errors.
      expect(["error", "warning"]).toContain(f[0]!.severity);
    });
    it(`${name} is silent when the platforms match`, () => {
      expect(run(rule, [matched, part("case", "skx007-case", SKX007_CASE)])).toHaveLength(0);
    });
  }
  it("chapter-ring-fit stays a warning, not an error", () => {
    const f = run(chapterRingFit, [part("chapterRing", "skx013-chapter-ring"), part("case", "skx007-case", SKX007_CASE)]);
    expect(severities(f)).toEqual(["warning"]);
  });
});

describe("strap-fit", () => {
  it("errors on a bracelet whose end-links are cut for another case line", () => {
    const f = run(strapFit, [part("strap", "skx013-bracelet"), part("case", "skx007-case", SKX007_CASE)]);
    expect(severities(f)).toEqual(["error"]);
  });
  it("warns, never blocks, on a lug-width mismatch: the case figure is its line's standard, not vendor-stated", () => {
    const f = run(strapFit, [part("strap", "generic-strap", { lugWidthMm: 20 }), part("case", "skx007-case", SKX007_CASE)]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("is silent on a generic strap at the matching lug width", () => {
    expect(run(strapFit, [part("strap", "generic-strap", { lugWidthMm: 22 }), part("case", "skx007-case", SKX007_CASE)])).toHaveLength(0);
  });
  it("warns instead of passing when lug width is unrecorded", () => {
    const f = run(strapFit, [part("strap", "generic-strap", {}), part("case", "skx007-case", SKX007_CASE)]);
    expect(severities(f)).toEqual(["warning"]);
  });
});

describe("insert-crystal-profile-fit", () => {
  it("errors on a flat insert under a double-domed crystal", () => {
    const f = run(insertCrystalProfileFit, [part("bezelInsert", "skx007-insert", { profile: "flat" }), part("crystal", "skx007-crystal", { profile: "domed" })]);
    expect(severities(f)).toEqual(["error"]);
  });
  it("errors on a sloped insert under a flat crystal", () => {
    const f = run(insertCrystalProfileFit, [part("bezelInsert", "skx007-insert", { profile: "slope" }), part("crystal", "skx007-crystal", { profile: "flat" })]);
    expect(severities(f)).toEqual(["error"]);
  });
  it("is silent on the vendor-recommended pairings", () => {
    expect(run(insertCrystalProfileFit, [part("bezelInsert", "skx007-insert", { profile: "flat" }), part("crystal", "skx007-crystal", { profile: "flat" })])).toHaveLength(0);
    expect(run(insertCrystalProfileFit, [part("bezelInsert", "skx007-insert", { profile: "slope" }), part("crystal", "skx007-crystal", { profile: "domed" })])).toHaveLength(0);
  });
  it("warns when a profile is unstated", () => {
    const f = run(insertCrystalProfileFit, [part("bezelInsert", "skx007-insert", { profile: null }), part("crystal", "skx007-crystal", { profile: "domed" })]);
    expect(severities(f)).toEqual(["warning"]);
  });
});

describe("dial-case-model-exclusion", () => {
  it("errors when the dial's own listing rules out this case family", () => {
    const f = run(dialCaseModelExclusion, [
      part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, incompatibleCaseFamilies: ["skx013-case"] }),
      part("case", "skx013-case", {}),
    ]);
    expect(severities(f)).toEqual(["error"]);
  });
  it("does not treat absence of a compatibility claim as an exclusion", () => {
    expect(
      run(dialCaseModelExclusion, [part("dial", "nh3x-dial-standard", PLAIN_DIAL), part("case", "skx013-case", {})]),
    ).toHaveLength(0);
  });
});

describe("hand-stack-clearance", () => {
  it("warns when hand length is unknown and a chapter ring is present", () => {
    const f = run(handStackClearance, [part("hands", "nh3x-hands-standard", { lengthSetMm: null }), part("chapterRing", "skx007-chapter-ring")]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("is silent with no chapter ring in the build", () => {
    expect(run(handStackClearance, [part("hands", "nh3x-hands-standard", { lengthSetMm: null })])).toHaveLength(0);
  });
});

describe("family-exception", () => {
  it("carries a documented exception through at its own severity", () => {
    const caseP = part("case", "lucius-ultra-thin-case");
    const f = run(familyException, [caseP], {
      familyExceptions: [{ partId: caseP.id, ruleKey: "lucius-ultra-thin-no-stock-skx-accessories", severity: "error", message: "documented" }],
    });
    expect(f).toEqual([expect.objectContaining({ ruleKey: "lucius-ultra-thin-no-stock-skx-accessories", severity: "error" })]);
  });
  it("is silent for parts with no exception row", () => {
    expect(run(familyException, [part("case", "skx007-case", SKX007_CASE)])).toHaveLength(0);
  });
});

describe("unverified-part", () => {
  it("warns on a family-inferred part", () => {
    const f = run(unverifiedPart, [part("dial", "nh3x-dial-standard", PLAIN_DIAL, { specSource: "family-inferred" })]);
    expect(severities(f)).toEqual(["warning"]);
  });
  it("is silent on a vendor-stated part", () => {
    expect(run(unverifiedPart, [part("dial", "nh3x-dial-standard", PLAIN_DIAL)])).toHaveLength(0);
  });
});

describe("lume-mismatch", () => {
  it("reports a confirmed mismatch as info", () => {
    const f = run(lumeMismatch, [part("hands", "nh3x-hands-standard", { lumed: true }), part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, lumed: false })]);
    expect(severities(f)).toEqual(["info"]);
  });
  it("says so rather than passing silently when lume is unstated", () => {
    const f = run(lumeMismatch, [part("hands", "nh3x-hands-standard", { lumed: null }), part("dial", "nh3x-dial-standard", PLAIN_DIAL)]);
    expect(severities(f)).toEqual(["info"]);
    expect(f[0]!.ruleKey).toBe("lume-mismatch");
  });
  it("is silent when both sides match", () => {
    expect(run(lumeMismatch, [part("hands", "nh3x-hands-standard", { lumed: true }), part("dial", "nh3x-dial-standard", { ...PLAIN_DIAL, lumed: true })])).toHaveLength(0);
  });
});

describe("stock-availability", () => {
  it("reports an out-of-stock cheapest listing", () => {
    const p = part("dial", "nh3x-dial-standard", PLAIN_DIAL);
    const f = run(stockAvailability, [p], { listings: [{ partId: p.id, vendorKey: "v1", priceMinorBase: 100, shippingFlatMinor: 0, inStock: false }] });
    expect(severities(f)).toEqual(["info"]);
  });
  it("says so rather than passing silently when a part has no listings", () => {
    const p = part("dial", "nh3x-dial-standard", PLAIN_DIAL);
    const f = run(stockAvailability, [p], { listings: [] });
    expect(severities(f)).toEqual(["info"]);
  });
  it("is silent when in stock", () => {
    expect(run(stockAvailability, [part("dial", "nh3x-dial-standard", PLAIN_DIAL)])).toHaveLength(0);
  });
});

describe("multi-vendor-shipping", () => {
  it("suggests consolidation across 3+ vendors", () => {
    const a = part("dial", "nh3x-dial-standard", PLAIN_DIAL);
    const b = part("hands", "nh3x-hands-standard", {});
    const c = part("case", "skx007-case", SKX007_CASE);
    const f = run(multiVendorShipping, [a, b, c], {
      listings: [a, b, c].map((p, i) => ({ partId: p.id, vendorKey: `v${i}`, priceMinorBase: 100, shippingFlatMinor: 500, inStock: true })),
    });
    expect(severities(f)).toEqual(["info"]);
  });
  it("says so rather than undercounting when listing data is missing", () => {
    const p = part("dial", "nh3x-dial-standard", PLAIN_DIAL);
    const f = run(multiVendorShipping, [p], { listings: [] });
    expect(severities(f)).toEqual(["info"]);
  });
  it("is silent for a single-vendor build", () => {
    expect(run(multiVendorShipping, [part("dial", "nh3x-dial-standard", PLAIN_DIAL)])).toHaveLength(0);
  });
});

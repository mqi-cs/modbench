// Regression test for the "Hands - Sumo" bug class, found during Task 3
// review (pre-Phase-2): an early nameFamilyConflict()/checkOutOfScope()
// implementation applied case-model name markers uniformly to every
// category, which would have wrongly flagged real nh3x-hands-standard and
// nh3x-dial-standard parts whose name references a case model as pure
// marketing/styling context, not a fit constraint. Fixed by scoping the
// skx-prefixed markers to CASE_SHAPE_DEPENDENT_CATEGORIES. This test exists
// so that scoping can't silently regress -- every fixture below is a real
// part from the catalog (data/modbench.db), not synthetic.
import { describe, expect, it } from "vitest";
import { nameFamilyConflict } from "./name-family-conflict";

describe("nameFamilyConflict", () => {
  it("does not flag a case-model name on hands -- cosmetic, not a fit constraint", () => {
    // Real part, luciusatelier: mounts on the standard NH3x pinion
    // regardless of the SRPD reference in its name.
    expect(
      nameFamilyConflict({
        name: "SEIKO SRPD Lumibrite Hands - Rose Gold",
        category: "hands",
        family: "nh3x-hands-standard",
      }),
    ).toBeNull();
  });

  it("does not flag a case-model name on a dial -- cosmetic, not a fit constraint", () => {
    // Real part, luciusatelier: seats by movement-family feet convention,
    // not by the SRPD reference in its name.
    expect(
      nameFamilyConflict({
        name: "SEIKO 5 Sports SRPD Dial - Orange",
        category: "dial",
        family: "nh3x-dial-standard",
      }),
    ).toBeNull();
  });

  it("still flags a case-model name mismatch on a case -- case shape is a real fit constraint", () => {
    // Real part, luciusatelier: named 'SKX013' but deliberately assigned to
    // lucius-ultra-thin-case, not skx013-case -- this IS the documented
    // Ultra Thin exception (family_exceptions row
    // lucius-ultra-thin-no-stock-skx-accessories). The check must still
    // flag it; a human approving despite the flag (because they've read the
    // exception) is the correct path, not evidence the check should be
    // silenced for this category.
    expect(
      nameFamilyConflict({
        name: "SKX013 Diver 38 Green — Ultra Thin Watch Case",
        category: "case",
        family: "lucius-ultra-thin-case",
      }),
    ).not.toBeNull();
  });

  it("does not flag a case-shape-dependent part whose name and family genuinely agree", () => {
    // Real part, dlwwatches: correctly tagged, no conflict expected.
    expect(
      nameFamilyConflict({
        name: "SKX007/SRPD Chapter Ring: Kanji Style Blue Finish w Silver Markers",
        category: "chapter_ring",
        family: "skx007-chapter-ring",
      }),
    ).toBeNull();
  });

  it("flags a genuine case-shape-dependent mismatch (not the Ultra Thin exception)", () => {
    // Synthetic: SKX013 named but tagged into the SKX007 chapter_ring
    // family -- exactly the class of mistake this check exists to catch on
    // a category where the case-model name IS a real fit constraint.
    expect(
      nameFamilyConflict({
        name: "SKX013 Replacement Chapter Ring",
        category: "chapter_ring",
        family: "skx007-chapter-ring",
      }),
    ).not.toBeNull();
  });

  it("flags an NH35/NH36 movement-family mismatch even on hands/dial -- these markers are not case-shape scoped", () => {
    // The category exemption only applies to the skx-prefixed (case-shape)
    // markers. NH35/NH36 are movement-family signals, which matter for
    // hands/dial too (wrong pinion/feet convention) -- so they're checked
    // unconditionally, everywhere. Synthetic: an NH35-labelled hand set
    // assigned to a made-up non-nh3x family should still flag.
    expect(
      nameFamilyConflict({
        name: "NH35 Automatic Hands Set - Silver",
        category: "hands",
        family: "vk6x-hands-standard",
      }),
    ).not.toBeNull();
  });
});

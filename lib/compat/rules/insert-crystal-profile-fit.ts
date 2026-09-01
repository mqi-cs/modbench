import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// NEW 2026-09-01, added during the Phase 2 mechanism audit after mining
// all four vendors' body_html for explicit incompatibility statements.
// This is a real constraint the original 15-rule table has no entry for,
// and one that platform matching structurally cannot catch: both parts can
// be correctly sized for the same case model and still not go together.
//
// Vendor warning text, repeated across ~39 watchandstyle SKUs:
//   "Ceramic Insert compatible with flat sapphire crystals only (not
//    compatible with double dome sapphire)"          -- CI1707, CI1708
//   "it takes flat crystals only, OEM or flat sapphire, and will not sit
//    correctly under a double dome"                  -- CI0024
//   "Crystal will not fit SKX007 OEM aluminum insert" -- SG003, SG007
//
// The physical relationship: a flat insert is machined to sit under a flat
// crystal, and a sloped insert is cut to follow the curve of a
// double-domed one. Pair them the wrong way and the insert doesn't seat
// flush -- it either stands proud of the bezel or leaves a gap under the
// crystal, regardless of both parts being the right diameter.
//
// A slope insert with a domed crystal, and a flat insert with a flat
// crystal, are the two combinations vendors actively recommend, so those
// are silent. The mismatch is an error only when BOTH profiles are stated;
// anything unstated warns.
export const insertCrystalProfileFit: Rule = {
  key: "insert-crystal-profile-fit",
  appliesTo: ["bezelInsert", "crystal"],
  evaluate(build, catalog): Finding[] {
    const insert = getPart(build, catalog, "bezelInsert");
    const crystal = getPart(build, catalog, "crystal");
    if (!insert || !crystal) return [];

    const insertProfile = insert.attributes.profile as string | null | undefined;
    const crystalProfile = crystal.attributes.profile as string | null | undefined;

    if (!insertProfile || !crystalProfile) {
      return [
        {
          ruleKey: "insert-crystal-profile-fit",
          severity: "warning",
          message: `Can't confirm "${insert.name}" and "${crystal.name}" have matching profiles -- flat or sloped isn't stated for one of them. A bezel insert has to be cut for the crystal above it: a flat insert sits under a flat crystal, a sloped one follows the curve of a double dome. Get this pair wrong and the insert won't seat flush even though both are the right diameter for the case.`,
          slots: ["bezelInsert", "crystal"],
        },
      ];
    }

    const flatInsertDomedCrystal = insertProfile === "flat" && crystalProfile === "domed";
    const slopeInsertFlatCrystal = insertProfile === "slope" && crystalProfile === "flat";
    if (flatInsertDomedCrystal || slopeInsertFlatCrystal) {
      return [
        {
          ruleKey: "insert-crystal-profile-fit",
          severity: "error",
          message: flatInsertDomedCrystal
            ? `"${insert.name}" is a flat insert and "${crystal.name}" is a double-domed crystal. A flat insert is machined to sit under a flat crystal -- under a dome it won't sit correctly, because the dome's curve rises away from the insert's flat face instead of following it. The vendor states this directly for inserts of this type: flat crystals only.`
            : `"${insert.name}" is a sloped insert and "${crystal.name}" is a flat crystal. A sloped insert is cut to follow the curve of a double-domed crystal -- under a flat one, its slope has nowhere to go and it stands proud of the bezel instead of seating flush. Sloped inserts and domed crystals are sold as a pair for this reason.`,
          slots: ["bezelInsert", "crystal"],
          fix: flatInsertDomedCrystal
            ? "Either switch to a flat sapphire crystal, or pick a sloped insert cut for a double dome."
            : "Either switch to a double-domed crystal, or pick a flat insert cut for a flat crystal.",
        },
      ];
    }

    return [];
  },
};

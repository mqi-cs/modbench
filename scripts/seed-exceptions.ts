// Seeds data/fixtures/family_exceptions rows for parts that are known,
// understood exceptions to their family's usual naming convention. Run
// AFTER scripts/import-tagged.ts, since family_exceptions.partId is a
// real FK -- entered here rather than truly before ingestion, but
// authored by hand for each family, not derived from any automated rule.
//
// Per specs/02-phase-1-data-pipeline.md: "Its first row is the Ultra Thin
// case... with a beginner-legible message." Extended during Task 3 review
// to cover every family this session found with the same shape: a real
// name/family conflict that verify-catalog.ts's check correctly flags,
// approved anyway because a human read the evidence and the conflict is
// understood, not a mistake.

import { nanoid } from "nanoid";
import { eq, inArray } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { familyExceptions, parts } from "../lib/db/schema";

const now = Date.now();

interface ExceptionFamily {
  family: string;
  ruleKey: string;
  severity: "error" | "warning" | "info";
  message: string;
  // Optional: only apply to parts whose name matches, instead of every part
  // in the family. Needed when a family mixes conflicting and
  // non-conflicting names (e.g. generic-strap holds both case-named straps
  // that are genuinely generic and plain NATO/leather straps that were
  // never flagged as a conflict in the first place -- blanket-applying the
  // exception to all of them would misrepresent non-conflicts as documented
  // exceptions).
  nameFilter?: RegExp;
}

const EXCEPTION_FAMILIES: ExceptionFamily[] = [
  {
    family: "lucius-ultra-thin-case",
    ruleKey: "lucius-ultra-thin-no-stock-skx-accessories",
    severity: "error",
    message:
      "This case has 'SKX013' in its name, but it's a redesigned case, not a standard SKX013 shell. " +
      "The maker says regular SKX013 bezels, inserts, and crystals won't fit it, and its own bezel/insert/crystal " +
      "won't fit a normal SKX013 case either. Only pick parts this listing says are made for it.",
  },
  {
    family: "lucius-ultra-thin-chapter-ring",
    ruleKey: "lucius-ultra-thin-no-stock-skx-accessories",
    severity: "error",
    message:
      "This chapter ring has 'SKX013' in its name, but it's shaped for the maker's redesigned Ultra Thin case, " +
      "not a standard SKX013 shell. It won't sit right in a normal SKX013 case -- only use it with the matching Ultra Thin case from the same line.",
  },
  {
    family: "ssk-gmt-crown",
    ruleKey: "srpd-ssk-shared-crown-tube",
    severity: "info",
    message:
      "This crown is labelled for both 'SRPD' and 'SSK' (Seiko 5 GMT) builds -- the maker states it fits both, " +
      "since those two case lines share the same crown tube size. Not a conflict, just a part that fits two families.",
  },
  {
    family: "generic-strap",
    ruleKey: "case-named-strap-is-lug-width-generic",
    severity: "info",
    message:
      "This strap's name mentions a specific case model (e.g. SKX007, SKX013), but the vendor's own listing states a " +
      "fixed lug width and lists multiple compatible case models -- it's a standard spring-bar strap, not shaped to " +
      "one case. It fits any case at the matching lug width, the case name is just the vendor's recommendation. " +
      "(Contrast with a bracelet or case-contoured strap, which is genuinely case-specific and gets its own family.)",
    nameFilter: /skx007|skx013|srpd/i,
  },
];

function main() {
  const existingPartIds = new Set(db.select({ partId: familyExceptions.partId }).from(familyExceptions).all().map((e) => e.partId));
  let inserted = 0;

  for (const ex of EXCEPTION_FAMILIES) {
    const familyMatches = db.select().from(parts).where(eq(parts.family, ex.family)).all();
    const matches = ex.nameFilter ? familyMatches.filter((p) => ex.nameFilter!.test(p.name)) : familyMatches;
    for (const part of matches) {
      if (existingPartIds.has(part.id)) continue; // idempotent: don't duplicate on re-run
      db.insert(familyExceptions)
        .values({
          id: nanoid(),
          partId: part.id,
          ruleKey: ex.ruleKey,
          severity: ex.severity,
          message: ex.message,
        })
        .run();
      inserted++;
    }
  }
  console.log(`Inserted ${inserted} family_exceptions row(s).`);
}

main();
sqlite.close();

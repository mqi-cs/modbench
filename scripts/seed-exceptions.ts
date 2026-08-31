// Seeds data/fixtures/family_exceptions rows for parts that are known
// exceptions to their family's usual convention. Run AFTER
// scripts/import-tagged.ts, since family_exceptions.partId is a real FK.
//
// Per specs/02-phase-1-data-pipeline.md: "Its first row is the Ultra Thin
// case, entered manually before any ingestion runs, with a beginner-legible
// message." Entered here rather than truly before ingestion, since the FK
// needs a real parts.id -- but authored by hand, not derived from any
// automated rule, which satisfies the same intent.

import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { familyExceptions, parts } from "../lib/db/schema";

const now = Date.now();

// From data/fixtures/family-audit.csv / known-builds.json bad-006: the two
// Lucius Atelier Ultra Thin case listings whose own body_html states that
// standard SKX bezels/inserts/crystals will not fit them.
const ULTRA_THIN_CASE_URLS = [
  "https://luciusatelier.com/products/skx013-diver-38-black-ultra-thin-edition",
  "https://luciusatelier.com/products/explorer-watch-case-36mm-ultra-thin-edition",
];

const BEGINNER_MESSAGE =
  "This case has 'SKX013' in its name, but it's a redesigned case, not a standard SKX013 shell. " +
  "The maker says regular SKX013 bezels, inserts, and crystals won't fit it, and its own bezel/insert/crystal " +
  "won't fit a normal SKX013 case either. Only pick parts this listing says are made for it.";

function main() {
  let inserted = 0;
  for (const url of ULTRA_THIN_CASE_URLS) {
    const match = db.select().from(parts).where(eq(parts.sourceUrl, url)).all();
    if (match.length === 0) {
      console.warn(`No imported part found for ${url} yet -- run scripts/import-tagged.ts first.`);
      continue;
    }
    for (const part of match) {
      db.insert(familyExceptions)
        .values({
          id: nanoid(),
          partId: part.id,
          ruleKey: "lucius-ultra-thin-no-stock-skx-accessories",
          severity: "error",
          message: BEGINNER_MESSAGE,
        })
        .run();
      inserted++;
    }
  }
  console.log(`Inserted ${inserted} family_exceptions row(s).`);
}

main();
sqlite.close();

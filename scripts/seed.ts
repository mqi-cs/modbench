// Hand-entered seed data, per specs/02-phase-1-data-pipeline.md "Seed data".
// Run once via `pnpm tsx scripts/seed.ts` before any ingestion.
//
// Families listed here are every family this session found real, multi-SKU
// evidence for -- see data/fixtures/family-audit.csv and
// data/fixtures/singleton-verification.md for the evidence behind each one.
// `snxs-crystal` is deliberately absent: confirmed at exactly 2 real SKUs
// across all 4 vendors' complete catalogs, all categories -- excluded per
// that verification, not a family this catalog tags into.

import { nanoid } from "nanoid";
import { db, sqlite } from "../lib/db/client";
import { families, familyExceptions, parts, vendors } from "../lib/db/schema";

const now = Date.now();

const FAMILIES: { key: string; category: string; label: string; description: string }[] = [
  // --- starting 6, from 00-PROJECT.md ---
  {
    key: "nh3x-movement",
    category: "movement",
    label: "NH3x movement",
    description:
      "NH35 (date), NH36 (day-date), NH34 (GMT), NH38 (no-date), and related NH-series calibers. Shared physical footprint and mounting convention across the family; day/date/GMT function varies by exact caliber and is tracked in attributes, not a separate family.",
  },
  {
    key: "nh3x-movement-accessory",
    category: "movement",
    label: "NH3x movement spare part",
    description:
      "Day-wheel/date-wheel discs, rotors, movement stems, and spacer rings for NH-series movements -- installs onto/into an existing NH3x movement, not a substitute for one. Split out of nh3x-movement pre-Phase-2 (2026-09-01) after review found 33 spare-part SKUs tagged into the same family as complete movements: with a shared family key, a build-configurator movement slot could not distinguish 'a rotor' from 'a movement' by family alone, which is exactly the false-positive shape Phase 2 exists to prevent. Not itself a swappable-movement family; Phase 2 should treat this as an add-on to an nh3x-movement selection, never as fulfilling the movement slot.",
  },
  {
    key: "nh3x-dial-standard",
    category: "dial",
    label: "NH3x dial, standard feet",
    description:
      "Dial has feet at 3 and 9 o'clock (or 4 legs trimmed to the needed 2) for direct clip-on mounting to an NH3x movement. Vendor-confirmed convention -- see namokimods.com body_html.",
  },
  {
    key: "nh3x-dial-feetless",
    category: "dial",
    label: "NH3x dial, feetless",
    description:
      "No mounting feet. Requires dial dots/glue and a beginner must be warned before ordering -- this is the canonical soft-warning case, not a hard block.",
  },
  {
    key: "nh3x-hands-standard",
    category: "hands",
    label: "NH3x hands, standard pinion",
    description: "Standard NH3x pinion bore sizing for hour/minute/second hands.",
  },
  {
    key: "skx007-case",
    category: "case",
    label: "SKX007/SRPD case",
    description: "SKX007/SRPD case dimensions (~42-43mm, standard dial aperture/bezel/crystal diameters for this line).",
  },
  {
    key: "skx013-case",
    category: "case",
    label: "SKX013 case",
    description: "SKX013 (smaller, ~38mm) case dimensions -- distinct dial/bezel/crystal diameters from SKX007.",
  },

  // --- confirmed real in Phase 0 / singleton-verification.md ---
  {
    key: "nmk-n4-case",
    category: "case",
    label: "Namoki N4 tool-watch case",
    description:
      "Proprietary namokimods.com case line (40mm width, 49mm lug-to-lug per vendor body_html). Confirmed 3 real SKUs (3 finishes). NOT SKX007 dimensions despite the visual styling -- see data/fixtures/known-builds.json bad-007.",
  },
  {
    key: "vk6x-case",
    category: "case",
    label: "VK63/64 chronograph case",
    description:
      "Case for the Seiko VK63/64 mechaquartz chronograph movement. Distinct pusher/sub-dial layout from any NH3x case. Confirmed real (namokimods.com maintains a separate 'VK Cases' product_type).",
  },
  {
    key: "vk6x-movement",
    category: "movement",
    label: "VK63/64 mechaquartz movement",
    description:
      "Quartz chronograph movement, physically incompatible with NH3x cases/dials/hands. Confirmed real via a live Reddit build (r/watchmodding, u/PotsnPants: 'the movement is a Vk64 from NamokiMods') and namokimods.com's dedicated VK product lines.",
  },
  {
    key: "vk6x-hands",
    category: "hands",
    label: "VK63/64 hands",
    description: "Hands sized for the VK6x chronograph pinion set, not interchangeable with nh3x-hands-standard. Confirmed 22 real SKUs at namokimods.com.",
  },
  {
    key: "nh34-gmt-dial",
    category: "dial",
    label: "NH34 GMT dial",
    description:
      "Dial with a GMT sub-scale/marker for the NH34 movement's 4th hand. Confirmed 15 real SKUs at luciusatelier.com, tagged fits-nh34 and (often) fits-skx007/fits-skx013.",
  },
  {
    key: "vk6x-dial",
    category: "dial",
    label: "VK63/64 chronograph dial",
    description: "Dial with sub-dial layout for the VK6x chronograph movement, part of the vk6x-case/vk6x-movement/vk6x-hands family group. Confirmed 7 real SKUs at namokimods.com ('Seiko VK Dials' product_type).",
  },
  {
    key: "srpe-case",
    category: "case",
    label: "SRPE case",
    description: "Seiko SRPE case line (Samurai-style), distinct dimensions from SKX007/013. Confirmed 24 real SKUs at dlwwatches.com.",
  },
  {
    key: "alpinist-style-case",
    category: "case",
    label: "Alpinist-style case",
    description: "~40mm Alpinist-style case with a fixed fluted bezel (no bezel insert). Confirmed 18 real SKUs at watchandstyle.net.",
  },
  {
    key: "srp-turtle-case",
    category: "case",
    label: "SRP Turtle case",
    description:
      "Seiko SRP Turtle case line (~44.3mm). Confirmed 194 real SKUs across cases, bezels, inserts, chapter rings, crowns, casebacks and bracelets at 3 of 4 vendors -- includes dedicated SKX007/SKX013-to-Turtle conversion cases at watchandstyle.net.",
  },

  // --- bezel insert / crystal / chapter ring, scoped per case family ---
  { key: "skx007-insert", category: "bezel_insert", label: "SKX007/SRPD bezel insert", description: "Bezel insert sized for the SKX007/SRPD bezel." },
  { key: "skx013-insert", category: "bezel_insert", label: "SKX013 bezel insert", description: "Bezel insert sized for the smaller SKX013 bezel." },
  { key: "skx007-crystal", category: "crystal", label: "SKX007/SRPD crystal", description: "Crystal sized for the SKX007/SRPD case. Confirmed 14 real SKUs at namokimods.com." },
  { key: "skx013-crystal", category: "crystal", label: "SKX013 crystal", description: "Crystal sized for the SKX013 case. Confirmed 3 real SKUs at luciusatelier.com." },
  { key: "srpe-crystal", category: "crystal", label: "SRPE crystal", description: "Crystal sized for the SRPE case. Confirmed 3 real SKUs at dlwwatches.com." },
  { key: "srp-turtle-crystal", category: "crystal", label: "SRP Turtle crystal", description: "Crystal sized for the SRP Turtle case, part of the broader srp-turtle-case family." },
  { key: "ssk-gmt-crystal", category: "crystal", label: "SSK (Seiko 5 GMT) crystal", description: "Crystal for the SSK/Seiko 5 GMT line, same resolution as ssk-gmt-chapter-ring." },
  { key: "srp-turtle-insert", category: "bezel_insert", label: "SRP Turtle bezel insert", description: "Bezel insert sized for the SRP Turtle case. Confirmed 10 real SKUs at namokimods.com." },
  { key: "srp-turtle-chapter-ring", category: "chapter_ring", label: "SRP Turtle chapter ring", description: "Chapter ring sized for the SRP Turtle case. Confirmed 16 real SKUs at namokimods.com, 20 at dlwwatches.com." },
  { key: "skx007-chapter-ring", category: "chapter_ring", label: "SKX007/SRPD chapter ring", description: "Chapter ring sized for the SKX007/SRPD case." },
  { key: "skx013-chapter-ring", category: "chapter_ring", label: "SKX013 chapter ring", description: "Chapter ring sized for the SKX013 case." },
  { key: "srpe-chapter-ring", category: "chapter_ring", label: "SRPE chapter ring", description: "Chapter ring sized for the SRPE case. Confirmed 2 real SKUs at dlwwatches.com." },
  {
    key: "ssk-gmt-chapter-ring",
    category: "chapter_ring",
    label: "SSK (Seiko 5 GMT) chapter ring",
    description:
      "Chapter ring for the 'SSK' Seiko 5 GMT line. Resolved in Phase 1 (see family-audit.csv notes) -- distinct from the unrelated 'SSK023' (SKX023) abbreviation. Vendor product_type confirms SKX007/SRPD compatibility.",
  },
  {
    key: "lucius-ultra-thin-case",
    category: "case",
    label: "Lucius Atelier Ultra Thin case",
    description:
      "Proprietary luciusatelier.com case redesign. Named with 'SKX013'/'SKX007' sizing in the title but the vendor's own listing states standard SKX bezels/inserts/crystals do NOT fit it, and it does not fit a stock SKX case. THE key false-positive trap -- see family_exceptions and known-builds.json bad-006.",
  },
  {
    key: "lucius-ultra-thin-chapter-ring",
    category: "chapter_ring",
    label: "Lucius Atelier Ultra Thin chapter ring",
    description: "Chapter ring scoped to the lucius-ultra-thin-case family specifically, not the generic skx013-case family.",
  },

  // --- bezel ring (the rotating ring, distinct from bezel_insert), crown, strap ---
  // Added when clearing the Phase 1 tagging backlog -- confirmed real,
  // multi-vendor categories (100+ SKUs each), not edge cases.
  { key: "skx007-bezel", category: "bezel", label: "SKX007/SRPD bezel ring", description: "The rotating bezel ring for the SKX007/SRPD case -- mates to the case, holds a skx007-insert." },
  { key: "skx013-bezel", category: "bezel", label: "SKX013 bezel ring", description: "The rotating bezel ring for the SKX013 case." },
  { key: "srpe-bezel", category: "bezel", label: "SRPE bezel ring", description: "The rotating bezel ring for the SRPE case." },
  { key: "srp-turtle-bezel", category: "bezel", label: "SRP Turtle bezel ring", description: "The rotating bezel ring for the SRP Turtle case." },
  { key: "ssk-gmt-bezel", category: "bezel", label: "SSK (Seiko 5 GMT) bezel ring", description: "The rotating bezel ring for the SSK/Seiko 5 GMT line, same resolution as ssk-gmt-chapter-ring." },

  { key: "skx007-crown", category: "crown", label: "SKX007/SRPD crown", description: "Crown sized for the SKX007/SRPD case tube." },
  { key: "skx013-crown", category: "crown", label: "SKX013 crown", description: "Crown sized for the SKX013 case tube." },
  { key: "srpe-crown", category: "crown", label: "SRPE crown", description: "Crown sized for the SRPE case tube." },
  { key: "srp-turtle-crown", category: "crown", label: "SRP Turtle crown", description: "Crown sized for the SRP Turtle case tube." },
  { key: "ssk-gmt-crown", category: "crown", label: "SSK (Seiko 5 GMT) crown", description: "Crown for the SSK/Seiko 5 GMT line, same resolution as ssk-gmt-chapter-ring." },

  { key: "skx007-bracelet", category: "strap", label: "SKX007/SRPD bracelet", description: "Metal bracelet with end-links contoured specifically to the SKX007/SRPD case -- not interchangeable with other case shapes despite matching lug width." },
  { key: "skx013-bracelet", category: "strap", label: "SKX013 bracelet", description: "Metal bracelet with end-links contoured to the SKX013 case." },
  { key: "srpe-bracelet", category: "strap", label: "SRPE bracelet", description: "Metal bracelet with end-links contoured to the SRPE case." },
  { key: "srp-turtle-bracelet", category: "strap", label: "SRP Turtle bracelet", description: "Metal bracelet with end-links contoured to the SRP Turtle case." },
  {
    key: "generic-strap",
    category: "strap",
    label: "Generic lug-width strap",
    description: "NATO, leather, rubber, or cotton straps that mount on spring bars and fit by lug width alone, not case shape -- compatible with any case at the matching lug width, unlike the case-specific bracelet families above.",
  },
];

// Phase 0 assumed every vendor reports USD. Checked directly against live
// product pages before seeding (not the bare /products.json, which carries
// no currency field) rather than continuing to assume: namokimods.com,
// luciusatelier.com, and dlwwatches.com all display SGD ("$105.00" carries
// no code on namoki's own product page, but the same style of page on
// lucius/dlw explicitly appends "SGD" -- consistent with all three being
// Singapore-based storefronts). watchandstyle.net is PHP (see below).
const VENDORS: { key: string; name: string; baseUrl: string; country: string; shippingFlatMinor: number; expectedCurrency: string }[] = [
  { key: "namokimods", name: "Namoki Mods", baseUrl: "https://namokimods.com", country: "SG", shippingFlatMinor: 1200, expectedCurrency: "SGD" },
  { key: "luciusatelier", name: "Lucius Atelier", baseUrl: "https://luciusatelier.com", country: "SG", shippingFlatMinor: 1000, expectedCurrency: "SGD" },
  { key: "dlwwatches", name: "DLW Watches", baseUrl: "https://dlwwatches.com", country: "SG", shippingFlatMinor: 1000, expectedCurrency: "SGD" },
  // Phase 0 flagged watchandstyle.net's /products.json prices as implausible
  // for USD (e.g. a date wheel disc at "1200.00"). Resolved in Phase 1 by
  // checking the actual live product page rather than guessing: it displays
  // "₱1,200.00 PHP" -- the vendor is genuinely priced in Philippine Pesos,
  // and the shipping notice confirms a Philippines-based store. ₱1,200 ≈ $21,
  // a sane price for that part. This was never a vendor data bug; it was
  // Phase 0's own unstated assumption that every vendor reports USD.
  { key: "watchandstyle", name: "Watch & Style", baseUrl: "https://watchandstyle.net", country: "PH", shippingFlatMinor: 150000, expectedCurrency: "PHP" },
];

function main() {
  const insertFamilies = db.insert(families).values(FAMILIES).onConflictDoNothing();
  insertFamilies.run();
  console.log(`Seeded ${FAMILIES.length} families.`);

  const vendorRows = VENDORS.map((v) => ({
    id: nanoid(),
    key: v.key,
    name: v.name,
    baseUrl: v.baseUrl,
    country: v.country,
    shippingFlatMinor: v.shippingFlatMinor,
    expectedCurrency: v.expectedCurrency,
    feedType: "shopify",
    createdAt: now,
    updatedAt: now,
  }));
  db.insert(vendors).values(vendorRows).onConflictDoNothing({ target: vendors.key }).run();
  console.log(`Seeded ${vendorRows.length} vendors.`);

  // family_exceptions references parts.id via FK, so the Lucius Ultra Thin
  // exception rows are inserted once those specific parts exist -- see
  // scripts/seed-exceptions.ts, run after tagging/import.
  console.log("Vendor/family seed complete. Run scripts/seed-exceptions.ts after the Ultra Thin case parts are imported.");
}

main();
sqlite.close();

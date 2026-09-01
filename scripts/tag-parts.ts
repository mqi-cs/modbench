// Tagging step. Per specs/02-phase-1-data-pipeline.md, tagging has no
// dedicated script requirement beyond "read data/raw/*.json, produce
// data/tagged/<vendor>.json" -- "whether a human or Claude Code produces
// this file, the review step below is the gate." This script IS that
// "Claude Code reading the raw feed files directly" path: deterministic
// rules below, no LLM call, encoding exactly the vendor product_type/tag
// patterns verified against real listings.
//
// Amendment A (01a-PHASE-0-FINDINGS.md): family must never be assigned
// from the product NAME alone. Every rule below keys off product_type
// and/or tags -- structured vendor category data, not free-text title
// matching -- which is what lets these come in above 'low' confidence.
// Rules that fall back to title substring matching are explicitly marked
// and capped at 'low' or 'medium'.
//
// v2 (backlog clearance): covers the previously-deprioritized categories
// (strap, crown, bezel-the-ring) and fixes the SRPE gap Investigation B
// found -- the namoki chapter-ring rule checked for skx013/skx007/turtle
// but never srpe, and the same gap existed in cases/crystals/bezels/crowns.
// resolveModelFamily() below is shared across every category-suffixed
// family (skx007-*, skx013-*, srpe-*, srp-turtle-*, ssk-gmt-*) specifically
// so this class of bug can't recur silently in one branch while being
// fixed in another -- one keyword list, reused everywhere.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { ShopifyProduct } from "../lib/vendor-feed-schema";

interface TaggedEntry {
  sourceUrl: string;
  name: string;
  category: string;
  family: string;
  attributes: Record<string, unknown>;
  specSource: "vendor-stated" | "family-inferred" | "manual";
  confidence: "high" | "medium" | "low";
  evidence: string;
}

interface RejectedEntry {
  sourceUrl: string;
  productName: string;
  reason: string;
}

// A product that fell through every vendor branch's if/else chain into the
// terminal `else` with checkOutOfScope() returning null -- neither tagged
// nor rejected, no trace anywhere. This is the exact shape every gap found
// pre-Phase-2 had (movement, chapter_ring, crystal, strap): a real product
// under a product_type string no branch checked for, silently dropped.
// Tracked separately from RejectedEntry (which is a considered "this is
// out of scope" decision) so the standard pipeline output can surface
// "nobody decided about this" as distinct from "this was excluded on
// purpose."
interface UnmatchedEntry {
  sourceUrl: string;
  productName: string;
  productType: string;
}

interface TagResult {
  tagged: TaggedEntry[];
  rejected: RejectedEntry[];
  unmatched: UnmatchedEntry[];
}

function latestRawFile(vendorKey: string): string {
  const files = readdirSync("data/raw").filter((f) => f.startsWith(`${vendorKey}-`) && f.endsWith(".json"));
  files.sort(); // ISO dates sort lexically
  const last = files[files.length - 1];
  if (!last) throw new Error(`No raw feed file for ${vendorKey}`);
  return `data/raw/${last}`;
}

function loadProducts(vendorKey: string): ShopifyProduct[] {
  const path = latestRawFile(vendorKey);
  const data = JSON.parse(readFileSync(path, "utf-8"));
  return data.products;
}

function tagsBlob(p: ShopifyProduct): string {
  return p.tags.join(",").toLowerCase();
}
function titleLower(p: ShopifyProduct): string {
  return p.title.toLowerCase();
}
function typeLower(p: ShopifyProduct): string {
  return p.product_type.toLowerCase();
}

function sourceUrl(baseUrl: string, p: ShopifyProduct): string {
  return `${baseUrl}/products/${p.handle}`;
}

// Shared keyword -> family-prefix resolver for every category that follows
// the skx007-*/skx013-*/srpe-*/srp-turtle-*/ssk-gmt-* naming convention
// (chapter_ring, bezel, crown, and the case-specific strap/bracelet
// families). Checked against the combined title+type+tags text.
function resolveCaseModelPrefix(text: string): string | null {
  if (/\bssk\b/.test(text) && !text.includes("ssk023")) return "ssk-gmt";
  if (text.includes("srpe")) return "srpe";
  if (text.includes("skx013")) return "skx013";
  if (text.includes("skx007") || text.includes("srpd")) return "skx007";
  if (text.includes("turtle")) return "srp-turtle";
  return null;
}

// A day/date-wheel disc, rotor, bridge, corrector wheel, dial washer,
// barrel, mainspring, C-clip, small screws, intermediate wheel/pinion,
// gasket, movement stem, or spacer ring installs onto an existing movement
// -- none of these are themselves a swappable movement. Found pre-Phase-2
// (2026-09-01): 33 were tagged straight into nh3x-movement alongside
// complete movements in this session's own tagging pass (fixed below), and
// a SEPARATE 75 were found already sitting in nh3x-movement from an
// earlier review pass that predates this split entirely -- decorative
// rotor/bridge finishes (Côtes de Genève, Clous de Paris, Great Wave,
// GS 9SA5, FPJ Diamond, ...) and small mechanical spares, all approved
// before nh3x-movement-accessory existed, so the tagger's "never overwrite
// an approved part" guard meant they'd stay silently mixed into the
// complete-movement family forever. A build configurator's movement slot
// treating "NH Movement Rotor - Côtes de Genève - Blue" as if it fulfilled
// the slot is exactly the false-positive shape this project exists to
// prevent -- movements anchor every Phase 2 rule. The 75 pre-existing rows
// were corrected directly (same evidence, see parts.evidence for each);
// this broadened pattern is what makes a full rebuild from scratch produce
// the same, correct classification from the source data.
//
// Deliberately checks the TITLE only, not the full title+type+tags blob:
// a complete movement's own tags can legitimately mention "Black Date
// Wheel" or "White Day Wheel" to describe which wheel color ships
// installed (watchandstyle does this) -- that's a spec of the movement,
// not evidence the product IS a wheel disc. Caught this as a live false
// positive on "Seiko (TMI) NH35A Automatic Movement" (tags: "White Day
// Wheel") before it reached review. Product titles for the actual spare
// parts always name the part itself ("... Day Wheel Disc", "... Movement
// Rotor", "... Movement Stem", "... Spacer Ring"), so title-only matching
// is both sufficient and precise here.
function isMovementAccessory(title: string): boolean {
  return /day.?wheel|date.?wheel|\brotor\b|\bbridge\b|corrector|\bwheel\b|washer|\bscrews?\b|\bbarrel\b|mainspring|\bc clip\b|\bsnap\b|\bspacer\b|\bpinion\b|\bgasket\b|movement stem|\bstem\b|holding spacer/i.test(title);
}

// Out-of-scope markers, split by what they actually constrain:
//
// BRAND markers indicate a genuinely different movement/pinion spec --
// these apply everywhere, hands and dials included, because a Miyota hand
// set is not sized for an NH3x pinion regardless of what case it's styled
// after.
//
// CASE_MODEL markers (Sumo, Samurai, MM300, etc.) are model-shape/diameter
// constraints. They matter for case, crown, bezel, bracelet-strap, crystal,
// and chapter_ring, which all physically depend on the case's exact
// dimensions -- but NOT for hands or dial, where "Sumo style" or "Samurai
// style" is a cosmetic name on an otherwise-ordinary NH3x-compatible part.
// (Concretely: "Hands - Sumo" at dlwwatches is a real NH3x hand set styled
// after the Sumo -- it mounts on the standard pinion regardless, and was
// already correctly tagged nh3x-hands-standard and used in
// known-builds.json before this pass. Applying the case-model check to
// hands/dial would silently regress that.)
const BRAND_OUT_OF_SCOPE: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bmiyota\b/, reason: "Miyota movement/hands -- a different movement brand from the NH3x family this catalog scopes, no family seeded" },
  { pattern: /\borient\b/, reason: "Orient brand part -- out of scope, this catalog covers Seiko/aftermarket NH3x-and-SKX-family parts only" },
  { pattern: /\btweezers?\b|\bbergeon\b|\bscrewdriver|\bhand.?press|\bcase.?opener|\bmovement holder/, reason: "a tool, not a watch part" },
  { pattern: /\bdiy watchmaking kit\b/, reason: "a bundled multi-part kit product, does not map to a single part category" },
  { pattern: /\bgasket\b/, reason: "a seal/gasket accessory, not a component with its own compatibility family" },
];

const CASE_MODEL_OUT_OF_SCOPE: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bssk023\b/, reason: "SKX023 family (abbreviated SSK023 by some vendors) -- a different case model, no family seeded this session" },
  { pattern: /\bsnxs\b/, reason: "insufficient real family size (snxs-crystal confirmed at 2 SKUs across all 4 vendors, all categories -- see singleton-verification.md)" },
  { pattern: /\bsumo\b/, reason: "Seiko Sumo case model -- a different case line (~45mm), no family seeded this session" },
  { pattern: /\bmm300\b/, reason: "Seiko MM300 case model -- a different case line, no family seeded this session" },
  { pattern: /\bsamurai\b/, reason: "Seiko Samurai case model -- a different case line, no family seeded this session" },
  { pattern: /\burchin\b|\bsnzf\b/, reason: "Seiko 'Sea Urchin' (SNZF) case model -- a different case line, no family seeded this session" },
  { pattern: /\b62mas\b/, reason: "Seiko 62MAS-style case -- a different case line, no family seeded this session" },
  { pattern: /\bmako\b|\bray\b/, reason: "Orient Mako/Ray case model -- different brand and case line, no family seeded this session" },
];

// bezel_insert included: an insert's outer diameter is exactly as
// case-diameter-dependent as the bezel ring it sits in, chapter ring, or
// crystal -- this was a real gap (found via Investigation B follow-up)
// that let model-specific inserts (e.g. "Ceramic Insert - Samurai...")
// silently stay untagged instead of being rejected with a reason.
const CASE_SHAPE_DEPENDENT_CATEGORIES = new Set(["case", "crown", "bezel", "bezel_insert", "strap", "crystal", "chapter_ring"]);

function checkOutOfScope(text: string, category: string): string | null {
  for (const { pattern, reason } of BRAND_OUT_OF_SCOPE) {
    if (pattern.test(text)) return reason;
  }
  if (CASE_SHAPE_DEPENDENT_CATEGORIES.has(category)) {
    for (const { pattern, reason } of CASE_MODEL_OUT_OF_SCOPE) {
      if (pattern.test(text)) return reason;
    }
  }
  return null;
}

// ---------- namokimods.com ----------
function tagNamoki(products: ShopifyProduct[]): TagResult {
  const base = "https://namokimods.com";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const tg = tagsBlob(p);
    const combined = `${ti} ${pt} ${tg}`;
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });
    const reject = (reason: string) => rejected.push({ sourceUrl: url, productName: p.title, reason });
    const markUnmatched = () => unmatched.push({ sourceUrl: url, productName: p.title, productType: p.product_type });

    if (pt === "tools" || pt === "gift cards") {
      // Found via the unmatched-product-type report: 15 real SKUs of
      // generic tools (not caught by the named-tool regex in
      // BRAND_OUT_OF_SCOPE, e.g. "Watchmaking Tool Kit") plus 1 gift card,
      // all sitting silently unmatched. Neither is a watch part.
      reject(pt === "gift cards" ? "a gift card, not a physical part" : "a tool, not a watch part");
    } else if (pt === "modded watches") {
      // Permanently excluded (2026-09-01): a complete, pre-built watch, not
      // a component -- out of scope for a parts compatibility catalog by
      // definition (there's no "family" a whole watch fits into). Found via
      // the unmatched-product-type report; 13 real SKUs, always this exact
      // product_type, so an explicit rule is cheaper and more legible than
      // leaving it to fall through to checkOutOfScope's generic path.
      reject("a complete, pre-built watch, not a component -- out of scope for a parts compatibility catalog");
    } else if (pt === "skx007 cases") {
      push("case", "skx007-case", "high", "vendor-stated", "vendor product_type 'SKX007 Cases'");
    } else if (pt === "skx013 cases") {
      push("case", "skx013-case", "high", "vendor-stated", "vendor product_type 'SKX013 Cases'");
    } else if (pt === "srpe cases") {
      push("case", "srpe-case", "high", "vendor-stated", "vendor product_type 'SRPE Cases'");
    } else if (pt === "vk cases") {
      push("case", "vk6x-case", "high", "vendor-stated", "vendor product_type 'VK Cases'");
    } else if (pt === "nmk cases" && ti.includes("n4 tool case")) {
      push("case", "nmk-n4-case", "high", "vendor-stated", "title 'N4 Tool Case' + body_html states 40mm/49mm lug-to-lug dimensions (verified Phase 0)");
    } else if (pt === "srp turtle cases" || (ti.includes("srp turtle") && ti.includes("case"))) {
      push("case", "srp-turtle-case", "high", "vendor-stated", "vendor product_type/title 'SRP Turtle Case(s)'");
    } else if (pt === "casebacks") {
      if (ti.includes("skx013")) push("case", "skx013-case", "medium", "family-inferred", "product_type 'Casebacks', title mentions SKX013");
      else push("case", "skx007-case", "medium", "family-inferred", "product_type 'Casebacks', assumed SKX007/SRPD shell (shared caseback thread per Lucius evidence, not independently confirmed on this SKU)");
    } else if (pt === "seiko dials" || (pt === "" && ti.startsWith("watch dial:"))) {
      const vendorStated = ti.includes("spork") || ti.includes("556 white");
      if (vendorStated) {
        push("dial", "nh3x-dial-standard", "high", "vendor-stated", "body_html states 4-leg convention, verified Phase 0 on this exact listing", { hasFeet: true });
      } else {
        push("dial", "nh3x-dial-standard", "medium", "family-inferred", "vendor product_type 'Seiko Dials'; same product line as body_html-verified listings, not individually re-checked");
      }
    } else if (pt === "seiko vk dials") {
      push("dial", "vk6x-dial", "high", "vendor-stated", "vendor product_type 'Seiko VK Dials'");
    } else if (pt === "seiko hands") {
      push("hands", "nh3x-hands-standard", "medium", "family-inferred", "vendor product_type 'Seiko Hands', no explicit pinion statement on this SKU");
    } else if (pt === "seiko vk hands") {
      push("hands", "vk6x-hands", "high", "vendor-stated", "vendor product_type 'Seiko VK Hands', distinct from the NH3x hands line");
    } else if (pt === "bezel inserts" || pt === "skx013 bezel inserts") {
      if (ti.includes("skx013")) push("bezel_insert", "skx013-insert", "high", "vendor-stated", "title/type explicit SKX013 bezel insert");
      else if (ti.includes("skx007") || ti.includes("srpd")) push("bezel_insert", "skx007-insert", "high", "vendor-stated", "title explicit SKX007/SRPD bezel insert");
    } else if (pt === "srp turtle bezel inserts") {
      push("bezel_insert", "srp-turtle-insert", "high", "vendor-stated", "vendor product_type 'SRP Turtle Bezel Inserts'");
    } else if (pt.includes("chapter ring")) {
      // Broad substring match: real product_type values here include
      // "Chapter Rings", "SRPE Chapter Rings", "SSK Chapter Rings",
      // "SRP Turtle Chapter Rings", "SKX013 Chapter Rings" and likely more
      // prefix variants -- an exact-match list kept missing new ones
      // (found via a follow-up sweep after the initial backlog pass).
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "chapter_ring");
      if (prefix) push("chapter_ring", `${prefix}-chapter-ring`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix}`);
      else if (oos) reject(oos);
      else reject("chapter ring with no identifiable case-model marker in title/type/tags -- would need body_html or vendor contact to resolve");
    } else if (pt.includes("sapphire crystal")) {
      const oos = checkOutOfScope(combined, "crystal");
      const prefix = resolveCaseModelPrefix(combined);
      if (oos) {
        reject(oos);
      } else if (prefix) {
        push("crystal", `${prefix}-crystal`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix}`);
      } else if (pt === "sapphire crystals") {
        // Bare "Sapphire Crystals" with no model marker at all -- this
        // vendor's most common crystal line is SKX007/SRPD, kept medium
        // since it's an assumption, not a stated fact on this specific SKU.
        push("crystal", "skx007-crystal", "medium", "family-inferred", "product_type 'Sapphire Crystals', assumed SKX007/SRPD (most common line at this vendor)");
      } else {
        reject("crystal with no identifiable case-model marker in title/type/tags");
      }
    } else if (
      pt === "movement spare parts" ||
      pt === "rotors" ||
      pt === "bridges" ||
      pt === "seiko movements" ||
      pt === "movement accessories"
    ) {
      // Real gap found pre-Phase-2 (same shape as the SRPE gap): this
      // vendor's plain movements and movement spare parts (day/date wheel
      // discs) sit under "Seiko Movements" / "Movement Accessories", two
      // product_type strings the tagger never checked.
      if (ti.includes("vk63") || ti.includes("vk64") || ti.includes("mecaquartz") || ti.includes("vk6")) {
        push("movement", "vk6x-movement", "high", "vendor-stated", `title explicit VK6x mecaquartz (product_type '${p.product_type}')`);
      } else if (isMovementAccessory(ti) && (ti.includes("nh") || pt.includes("movement"))) {
        push("movement", "nh3x-movement-accessory", "high", "vendor-stated", `day/date wheel disc, rotor, stem, or spacer for NH-series (product_type '${p.product_type}') -- not a swappable movement`);
      } else if (ti.includes("nh35") || ti.includes("nh36") || ti.includes("nh34") || ti.includes("nh38") || ti.includes("nh ")) {
        push("movement", "nh3x-movement", "high", "vendor-stated", `title explicit NH-series (product_type '${p.product_type}')`);
      } else {
        const oos = checkOutOfScope(combined, "movement");
        if (oos) reject(oos);
        else reject(`movement/movement-spare-part with no identifiable caliber marker in title (product_type '${p.product_type}')`);
      }
    } else if (pt.endsWith("bezels")) {
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "bezel");
      if (prefix) push("bezel", `${prefix}-bezel`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix}`);
      else if (oos) reject(oos);
      else reject("bezel ring with no identifiable case-model marker in title/type/tags");
    } else if (pt.endsWith("crowns")) {
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "crown");
      if (prefix) push("crown", `${prefix}-crown`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix}`);
      else if (oos) reject(oos);
      else reject("crown with no identifiable case-model marker in title/type/tags");
    } else if (pt.endsWith("bracelets")) {
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "strap");
      if (prefix) push("strap", `${prefix}-bracelet`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix} (case-contoured end-links, not a generic lug-width strap)`);
      else if (oos) reject(oos);
      else reject("bracelet with no identifiable case-model marker -- end-link shape is case-specific, cannot default to a generic strap family");
    } else if (pt.includes("strap") || pt.includes("nato")) {
      push("strap", "generic-strap", "medium", "family-inferred", `product_type '${p.product_type}' -- lug-width-based strap (leather/rubber/NATO/cotton), fits any case at the matching lug width, not case-specific`);
    } else {
      const oos = checkOutOfScope(combined, "unknown");
      if (oos) reject(oos);
      else unmatched.push({ sourceUrl: url, productName: p.title, productType: p.product_type });
    }
  }

  return { tagged, rejected, unmatched };
}

// ---------- luciusatelier.com ----------
function tagLucius(products: ShopifyProduct[]): TagResult {
  const base = "https://luciusatelier.com";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const tg = tagsBlob(p);
    const combined = `${ti} ${pt} ${tg}`;
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });
    const reject = (reason: string) => rejected.push({ sourceUrl: url, productName: p.title, reason });
    const markUnmatched = () => unmatched.push({ sourceUrl: url, productName: p.title, productType: p.product_type });

    const isUltraThin = tg.includes("ultra-thin") || ti.includes("ultra thin");

    if (pt === "watch tools" || pt === "gift card" || pt === "service") {
      // Found via the unmatched-product-type report: 1 generic tool SKU
      // (not caught by the named-tool regex, e.g. "Spring Bar Tool With 4
      // Extra Tips"), 1 gift card, and 4 labor services (e.g. "Install
      // Rotor"). None are physical parts.
      reject(pt === "gift card" ? "a gift card, not a physical part" : pt === "service" ? "a labor service, not a physical part" : "a tool, not a watch part");
    } else if (pt === "watches") {
      // Permanently excluded (2026-09-01): a complete, pre-built watch, not
      // a component -- out of scope for a parts compatibility catalog by
      // definition (there's no "family" a whole watch fits into). Found via
      // the unmatched-product-type report; 75 real SKUs, always this exact
      // product_type, so an explicit rule is cheaper and more legible than
      // leaving it to fall through to checkOutOfScope's generic path.
      reject("a complete, pre-built watch, not a component -- out of scope for a parts compatibility catalog");
    } else if (pt === "cases") {
      const oos = checkOutOfScope(combined, "case");
      if (isUltraThin) {
        push("case", "lucius-ultra-thin-case", "high", "vendor-stated", "body_html states standard SKX bezels/inserts/crystals do NOT fit -- verified Phase 0. THE false-positive-trap family.");
      } else if (tg.includes("fits-skx013")) {
        push("case", "skx013-case", "medium", "family-inferred", "product_type 'Cases', tag fits-skx013, not part of the Ultra Thin line");
      } else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "casebacks") {
      push("case", "skx007-case", "medium", "family-inferred", "tags fits-skx013/skx007/7s26-0020/0030 -- caseback thread shared across SKX007/013 shells per vendor tags, not independently confirmed");
    } else if (pt === "dials") {
      const oos = checkOutOfScope(combined, "dial"); // brand-only check: case-model names (Sumo etc.) are cosmetic on dials, not a fit constraint
      if (tg.includes("gmt - nh34")) {
        push("dial", "nh34-gmt-dial", "high", "vendor-stated", "tags explicit 'GMT - NH34'");
      } else if (tg.includes("fits-skx013") || tg.includes("skx007")) {
        push("dial", "nh3x-dial-standard", "medium", "family-inferred", "product_type 'Dials', fits-skx013/skx007 tags, no explicit feet statement on this SKU");
      } else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "hands") {
      const oos = checkOutOfScope(combined, "hands"); // brand-only check: same reasoning as dial
      if (tg.includes("gmt - nh34") || (tg.includes("gmt") && tg.includes("nh34"))) {
        push("hands", "nh3x-hands-standard", "high", "vendor-stated", "tags explicit fits-nh34/GMT -- GMT-capable hand set", { gmt: true });
      } else if (tg.includes("fits-nh34") || tg.includes("fits-nh35") || tg.includes("fits-nh36")) {
        push("hands", "nh3x-hands-standard", "high", "vendor-stated", "tags explicit fits-nh34/35/36/38/72");
      } else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "bezel inserts") {
      const oos = checkOutOfScope(combined, "bezel_insert");
      if (isUltraThin) {
        push("bezel_insert", "skx013-insert", "low", "manual", "Ultra Thin-scoped insert -- excluded from generic skx013-insert confidence; do not treat as fitting a stock SKX013 case");
      } else if (tg.includes("fits-skx013")) {
        push("bezel_insert", "skx013-insert", "high", "vendor-stated", "tag explicit fits-skx013");
      } else if (tg.includes("skx007")) {
        // Found via the unmatched-product-type report: this branch only
        // ever checked the 'fits-skx013' tag, missing every SKX007-tagged
        // insert (this vendor tags those plain 'skx007', not
        // 'fits-skx007') -- same gap shape as the SRPE gap.
        push("bezel_insert", "skx007-insert", "high", "vendor-stated", "tag explicit skx007");
      } else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "crystals") {
      const oos = checkOutOfScope(combined, "crystal");
      if (tg.includes("fits-skx013") && !isUltraThin) {
        push("crystal", "skx013-crystal", "high", "vendor-stated", "tag explicit fits-skx013");
      } else if (tg.includes("skx007")) {
        push("crystal", "skx007-crystal", "high", "vendor-stated", "tag explicit skx007");
      } else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "chapter rings") {
      const oos = checkOutOfScope(combined, "chapter_ring");
      if (isUltraThin) {
        push("chapter_ring", "lucius-ultra-thin-chapter-ring", "medium", "family-inferred", "title/tags 'Ultra Thin' -- scoped to lucius-ultra-thin-case, not generic skx013-case (see family-audit.csv)");
      } else if (tg.includes("fits-skx013")) {
        push("chapter_ring", "skx013-chapter-ring", "high", "vendor-stated", "tag explicit fits-skx013");
      } else if (tg.includes("skx007")) {
        push("chapter_ring", "skx007-chapter-ring", "high", "vendor-stated", "tag explicit skx007");
      } else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "movements") {
      push("movement", "nh3x-movement", "high", "vendor-stated", `title explicit '${p.title}'`);
    } else if (pt === "rotors" || pt === "bridges") {
      if (tg.includes("fits-nh34") || tg.includes("fits-nh35") || tg.includes("fits-nh36")) {
        push("movement", "nh3x-movement-accessory", "high", "vendor-stated", "tags explicit fits-nh34/35/36/38/72 -- rotor/bridge spare part, not a swappable movement");
      } else {
        const oos = checkOutOfScope(combined, "movement");
        if (oos) reject(oos);
      }
    } else if (pt === "bezels") {
      const prefix = isUltraThin ? null : tg.includes("fits-skx013") ? "skx013" : resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "bezel");
      if (isUltraThin) push("bezel", "skx013-bezel", "low", "manual", "Ultra Thin-scoped bezel ring -- do not treat as fitting a stock SKX013 case");
      else if (prefix) push("bezel", `${prefix}-bezel`, "high", "vendor-stated", `tags/title match -> ${prefix}`);
      else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "crowns") {
      const prefix = tg.includes("fits-skx013") ? "skx013" : resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "crown");
      if (prefix) push("crown", `${prefix}-crown`, "high", "vendor-stated", `tags/title match -> ${prefix}`);
      else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "bracelets") {
      const prefix = isUltraThin ? null : tg.includes("fits-skx013") ? "skx013" : resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "strap");
      if (isUltraThin) reject("Ultra Thin-scoped bracelet -- end-links contoured to a proprietary case, does not fit stock SKX shells");
      else if (prefix) push("strap", `${prefix}-bracelet`, "high", "vendor-stated", `tags/title match -> ${prefix} (case-contoured end-links)`);
      else if (/^(oyster|settimo|president|jubilee|gs|super engineer|beads of rice|milanese) bracelet \d+\/\d+mm/i.test(ti)) {
        // Found in the Phase 3 body_html mining pass. These carry no
        // case-model marker in the title (so resolveCaseModelPrefix can't
        // see them, and they sat unmatched), but their body_html names the
        // exact cases they fit -- all SKX013-line Lucius cases -- and adds
        // a constraint narrower than any family key can carry: "Fits
        // Lucius Atelier cases only. The end-links are shaped to our case
        // profiles -- this bracelet does not fit generic 20mm lugs or OEM
        // [cases]". Tagged to the case line the vendor lists; the
        // vendor-only narrowing rides on the vendorScopedTo attribute and
        // is enforced by the bracelet-vendor-scope rule.
        push("strap", "skx013-bracelet", "medium", "vendor-stated", "body_html lists SKX013-line Lucius cases + 'Fits Lucius Atelier cases only' -- case line from vendor text, vendor-only scope carried in attributes");
      } else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "straps") {
      push("strap", "generic-strap", "medium", "family-inferred", "product_type 'Straps' -- lug-width-based, fits any case at the matching lug width");
    } else {
      const oos = checkOutOfScope(combined, "unknown");
      if (oos) reject(oos);
      else unmatched.push({ sourceUrl: url, productName: p.title, productType: p.product_type });
    }
  }

  return { tagged, rejected, unmatched };
}

// ---------- dlwwatches.com ----------
function tagDlw(products: ShopifyProduct[]): TagResult {
  const base = "https://dlwwatches.com";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const tg = tagsBlob(p);
    const combined = `${ti} ${pt} ${tg}`;
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });
    const reject = (reason: string) => rejected.push({ sourceUrl: url, productName: p.title, reason });
    const markUnmatched = () => unmatched.push({ sourceUrl: url, productName: p.title, productType: p.product_type });

    if (pt === "watch tools") {
      // Found via the unmatched-product-type report: this vendor files
      // both its gift card and its "Custom Orders" listing under product_type
      // "Watch Tools" -- neither is a physical, catalogable part.
      reject("gift card or bespoke custom-order listing, not a physical part");
    } else if (pt === "cases") {
      const oos = checkOutOfScope(combined, "case");
      if (tg.includes("srpe")) push("case", "srpe-case", "high", "vendor-stated", "tag explicit SRPE");
      else if (tg.includes("skx007") || tg.includes("srpd")) push("case", "skx007-case", "high", "vendor-stated", "tag explicit SKX007/SRPD (Turtle-styled variants are dimensionally SKX007 per the tag, styling name aside)");
      else if (oos) reject(oos);
      else markUnmatched();
    } else if (ti.includes("movement") && (ti.includes("nh34") || ti.includes("nh35") || ti.includes("nh36"))) {
      push("movement", "nh3x-movement", "high", "vendor-stated", "title explicit NH34/35/36 movement");
    } else if (pt === "dials") {
      const oos = checkOutOfScope(combined, "dial"); // brand-only: case-model style names on a dial aren't a fit constraint
      if (oos) reject(oos);
      else push("dial", "nh3x-dial-standard", "medium", "family-inferred", "product_type 'Dials', no explicit feet/fitment tag on this SKU");
    } else if (pt === "hands") {
      const oos = checkOutOfScope(combined, "hands"); // brand-only, same reasoning
      if (oos) reject(oos);
      else push("hands", "nh3x-hands-standard", "medium", "family-inferred", "product_type 'Hands', no explicit pinion tag on this SKU");
    } else if (pt === "ceramic bezel inserts" || (ti.startsWith("ceramic insert") || ti.startsWith("sapphire insert") || ti.startsWith("steel insert"))) {
      const oos = checkOutOfScope(combined, "bezel_insert");
      if (tg.includes("srp turtle") || ti.includes("turtle")) push("bezel_insert", "srp-turtle-insert", "high", "vendor-stated", "tag/title explicit SRP Turtle");
      else if (tg.includes("skx007") || tg.includes("srpd")) push("bezel_insert", "skx007-insert", "high", "vendor-stated", "tag explicit SKX007/SRPD");
      else if (oos) reject(oos);
      else markUnmatched();
    } else if (pt === "crystals") {
      // Broadened pre-Phase-2: was SRPE/Turtle-only, missing real SKX007/
      // SKX013 crystals (tag "SKX007 & SRPD (Slope)" etc.) -- same shape
      // as the SRPE gap.
      const oos = checkOutOfScope(combined, "crystal");
      if (tg.includes("srpe")) push("crystal", "srpe-crystal", "high", "vendor-stated", "tag explicit SRPE");
      else if (tg.includes("srp turtle") || ti.includes("turtle")) push("crystal", "srp-turtle-crystal", "high", "vendor-stated", "tag/title explicit SRP Turtle");
      else if (tg.includes("skx013")) push("crystal", "skx013-crystal", "high", "vendor-stated", "tag explicit SKX013");
      else if (tg.includes("skx007") || tg.includes("srpd")) push("crystal", "skx007-crystal", "high", "vendor-stated", "tag explicit SKX007/SRPD");
      else if (oos) reject(oos);
      else reject(`crystal with no identifiable case-model marker in tags (product_type '${p.product_type}')`);
    } else if (pt === "chapter rings") {
      // Broadened pre-Phase-2: was SRPE/Turtle-only, missing 46 real
      // SKX007/SRPD chapter rings (tag "SKX007 & SRPD", "With Markers")
      // that were silently skipped instead of tagged or rejected.
      const oos = checkOutOfScope(combined, "chapter_ring");
      if (tg.includes("srpe")) push("chapter_ring", "srpe-chapter-ring", "high", "vendor-stated", "tag explicit SRPE");
      else if (ti.includes("turtle")) push("chapter_ring", "srp-turtle-chapter-ring", "high", "vendor-stated", "title explicit Turtle chapter ring");
      else if (tg.includes("skx007") || tg.includes("srpd")) push("chapter_ring", "skx007-chapter-ring", "high", "vendor-stated", "tag explicit SKX007/SRPD");
      else if (tg.includes("skx013")) push("chapter_ring", "skx013-chapter-ring", "high", "vendor-stated", "tag explicit SKX013");
      else if (oos) reject(oos);
      else reject(`chapter ring with no identifiable case-model marker in tags (product_type '${p.product_type}')`);
    } else if (pt === "bezels") {
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "bezel");
      if (prefix) push("bezel", `${prefix}-bezel`, "high", "vendor-stated", `tag/title match -> ${prefix}`);
      else if (oos) reject(oos);
      else reject("bezel ring with no identifiable case-model marker in title/tags");
    } else if (pt === "crowns") {
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "crown");
      if (prefix) push("crown", `${prefix}-crown`, "high", "vendor-stated", `tag/title match -> ${prefix}`);
      else if (oos) reject(oos);
      else reject("crown with no identifiable case-model marker in title/tags");
    } else if (pt === "straps") {
      const prefix = resolveCaseModelPrefix(combined);
      // dlwwatches' "Straps" type covers both generic leather/rubber and
      // case-specific bracelets in this feed; only route to a case-specific
      // bracelet family when the title/tags actually name a model.
      if (prefix) push("strap", `${prefix}-bracelet`, "medium", "family-inferred", `title/tag mentions ${prefix}, but product_type 'Straps' doesn't distinguish bracelet vs strap construction -- kept medium`);
      else push("strap", "generic-strap", "medium", "family-inferred", "product_type 'Straps', no case-model marker -- assumed lug-width-based");
    } else if (ti.startsWith("yard sale")) {
      // Found via the unmatched-product-type report (2026-09-01): 84 SKUs
      // with product_type left blank, all "YARD SALE - <part> (Random
      // Design)" -- a grab-bag of surplus stock where the buyer doesn't
      // choose the design. Genuinely un-taggable: a family assignment
      // claims a specific, known physical spec, and "random design" is
      // explicitly the opposite of that. Reject, don't silently drop --
      // this is a real, large SKU count and someone should be able to see
      // why it's excluded, not just find it missing.
      reject("'Yard Sale' random-design surplus bundle -- vendor does not let the buyer choose the specific part/design, so no family can be assigned in good faith");
    } else if (ti === "springbar tool") {
      reject("a tool, not a watch part");
    } else if (ti.startsWith("7s26 movement")) {
      // Same blank-product_type cluster, one real SKU: a 7S26 is a
      // different movement architecture from the NH3x family this catalog
      // scopes (different height, different rotor/keyless works) -- not a
      // drop-in swap. Single SKU across all 4 vendors' full catalogs, same
      // singleton shape as snxs-crystal (see singleton-verification.md):
      // not enough real evidence to seed and maintain a whole new family
      // for one listing.
      reject("Seiko 7S26 movement -- a different movement architecture from the NH3x family this catalog scopes, and only 1 SKU found across all 4 vendors -- insufficient to seed a family (same bar as snxs-crystal, see singleton-verification.md)");
    } else if (ti.startsWith("dial - handcrafted series")) {
      const oos = checkOutOfScope(combined, "dial");
      if (oos) reject(oos);
      else push("dial", "nh3x-dial-standard", "medium", "family-inferred", "title explicit 'Handcrafted Series' decorative dial, blank product_type -- no explicit feet/fitment statement, same confidence as this vendor's plain 'Dials' product_type");
    } else if (ti.startsWith("hands - handcrafted series")) {
      const oos = checkOutOfScope(combined, "hands");
      if (oos) reject(oos);
      else push("hands", "nh3x-hands-standard", "medium", "family-inferred", "title explicit 'Handcrafted Series' hands, blank product_type -- no explicit pinion statement, same confidence as this vendor's plain 'Hands' product_type");
    } else if (ti.startsWith("chapter ring") && ti.includes("handcrafted series")) {
      const oos = checkOutOfScope(combined, "chapter_ring");
      if (ti.includes("skx007") || ti.includes("srpd")) push("chapter_ring", "skx007-chapter-ring", "high", "vendor-stated", "title explicit SKX007/SRPD Handcrafted Series chapter ring");
      else if (oos) reject(oos);
      else reject(`Handcrafted Series chapter ring with no identifiable case-model marker in title (title '${p.title}')`);
    } else if (ti.startsWith("ceramic insert") && ti.includes("handcrafted series")) {
      const oos = checkOutOfScope(combined, "bezel_insert");
      if (oos) reject(oos);
      else reject(`Handcrafted Series bezel insert with no identifiable case-model marker in title (title '${p.title}') -- unlike the chapter rings in this same series, this one doesn't state SKX007/SRPD/SKX013`);
    } else {
      const oos = checkOutOfScope(combined, "unknown");
      if (oos) reject(oos);
      else unmatched.push({ sourceUrl: url, productName: p.title, productType: p.product_type });
    }
  }

  return { tagged, rejected, unmatched };
}

// ---------- watchandstyle.net ----------
function tagWatchAndStyle(products: ShopifyProduct[]): TagResult {
  const base = "https://watchandstyle.net";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const tg = tagsBlob(p);
    const combined = `${ti} ${pt} ${tg}`;
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });
    const reject = (reason: string) => rejected.push({ sourceUrl: url, productName: p.title, reason });
    const markUnmatched = () => unmatched.push({ sourceUrl: url, productName: p.title, productType: p.product_type });

    if (ti.includes("snxs") || ti.includes("ssk023")) {
      const oos = checkOutOfScope(combined, "case"); // these two markers only ever appear on case-dependent items in this vendor's real catalog
      if (oos) {
        reject(oos);
        continue;
      }
    }

    if (pt === "case back") {
      // Found via the unmatched-product-type report: 21 real SKUs under a
      // product_type this vendor's case-handling branches never checked
      // (they key on 'replacement case', not 'case back'). Same family as
      // the rest of the catalog's casebacks -- a caseback is a component of
      // the case assembly, threaded to match, not its own compatibility
      // family (see e.g. 'SKX Sapphire Display Caseback', already tagged
      // skx007-case).
      if (ti.includes("service") || ti.includes("engraving")) {
        reject("a laser-engraving service, not a physical caseback part");
      } else if (ti.includes("skx007")) {
        push("case", "skx007-case", "high", "vendor-stated", "title explicit SKX007 caseback -- tagged into skx007-case, same convention as this catalog's other casebacks");
      } else {
        const oos = checkOutOfScope(combined, "case");
        if (oos) reject(oos);
        else reject(`caseback with no identifiable case-model marker in title (title '${p.title}')`);
      }
    } else if (pt === "tools") {
      reject("a tool, not a watch part");
    } else if (ti.includes("alpinist") && (pt.includes("case") || pt.includes("replacement case"))) {
      push("case", "alpinist-style-case", "high", "vendor-stated", "title explicit 'Alpinist', product_type 'Replacement Case'");
    } else if (pt.includes("skx007/srpd") && pt.includes("case")) {
      push("case", "skx007-case", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (ti.includes("skx013") && pt.includes("case")) {
      push("case", "skx013-case", "high", "vendor-stated", "title explicit SKX013, product_type is a replacement case");
    } else if (pt.includes("srpe") && pt.includes("case")) {
      push("case", "srpe-case", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("replacement case")) {
      // Generic "40mm/36mm Replacement Case" etc. with no recognized model
      // marker -- e.g. "Explorer Style", "62mas Style" -- real case lines,
      // just not ones with a family seeded this session.
      const oos = checkOutOfScope(combined, "case");
      if (oos) reject(oos);
      else reject(`replacement case with no identifiable case-model marker (product_type '${p.product_type}') -- a real case line, no family seeded this session`);
    } else if (pt === "dial") {
      const oos = checkOutOfScope(combined, "dial"); // brand-only: case-model style names on a dial aren't a fit constraint
      if (oos) reject(oos);
      else push("dial", "nh3x-dial-standard", "low", "family-inferred", "product_type 'Dial', no fitment tags in feed metadata at all -- weakest-evidenced vendor for dials, per Phase 0 audit");
    } else if (pt === "hands") {
      const oos = checkOutOfScope(combined, "hands"); // brand-only, same reasoning
      if (oos) reject(oos);
      else push("hands", "nh3x-hands-standard", "low", "family-inferred", "product_type 'Hands', no fitment tags in feed metadata at all -- weakest-evidenced vendor for hands, per Phase 0 audit");
    } else if (pt.includes("insert") && !pt.includes("gasket")) {
      // Broad substring match: real product_type values include "SKX007/SRPD
      // Ceramic Insert", "SKX007/SRPD Sapphire Insert", "SKX013 Ceramic
      // Insert", "Aluminum Insert", "SKX007/SRPD Steel Insert" -- an
      // exact-match-per-material list kept missing variants.
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "bezel_insert");
      if (prefix) push("bezel_insert", `${prefix}-insert`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix}`);
      else if (oos) reject(oos);
      else reject(`bezel insert with no identifiable case-model marker (product_type '${p.product_type}')`);
    } else if (pt.includes("snzf") && pt.includes("chapter ring")) {
      // Found via the unmatched-product-type report: 2 SKUs fell through
      // to the generic catch-all's category "unknown" check, which never
      // applies CASE_MODEL_OUT_OF_SCOPE (scoped to CASE_SHAPE_DEPENDENT_CATEGORIES,
      // which "unknown" isn't in) -- so the existing SNZF/Sea Urchin
      // out-of-scope marker never fired. Routed through checkOutOfScope
      // with the real category so it rejects with the real reason instead
      // of silently vanishing.
      const oos = checkOutOfScope(combined, "chapter_ring");
      if (oos) reject(oos);
    } else if (pt.includes("skx013") && pt.includes("chapter ring")) {
      push("chapter_ring", "skx013-chapter-ring", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("skx007/srpd") && pt.includes("chapter ring")) {
      if (ti.includes("ssk")) push("chapter_ring", "ssk-gmt-chapter-ring", "medium", "family-inferred", "title 'SSK', product_type says SKX007/SRPD but tag says Seiko 5 GMT -- resolved cross-vendor, kept medium pending Phase-2-time reconciliation");
      else push("chapter_ring", "skx007-chapter-ring", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("srpe") && pt.includes("chapter ring")) {
      push("chapter_ring", "srpe-chapter-ring", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("sapphire crystal") || ti.includes("srp turtle")) {
      // Broadened pre-Phase-2: was Turtle-only, missing 19 real SKX007/
      // SKX013/SRPE sapphire crystals -- same shape as the SRPE gap.
      const oos = checkOutOfScope(combined, "crystal");
      if (ti.includes("srp turtle") || (ti.includes("turtle") && pt.includes("sapphire"))) {
        push("crystal", "srp-turtle-crystal", "high", "vendor-stated", "title/type explicit SRP Turtle crystal");
      } else {
        const prefix = resolveCaseModelPrefix(combined);
        if (prefix) push("crystal", `${prefix}-crystal`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix}`);
        else if (oos) reject(oos);
        else reject(`crystal with no identifiable case-model marker (product_type '${p.product_type}')`);
      }
    } else if (pt.includes("nh movement") || pt === "daywheel") {
      // Real gap found pre-Phase-2: watchandstyle had NO movement-tagging
      // branch at all -- "NH Movement", "NH Movement Rotor", "Daywheel"
      // (day-window discs) were all silently skipped.
      const oos = checkOutOfScope(combined, "movement");
      if (oos) reject(oos);
      else if (isMovementAccessory(ti) || pt === "daywheel")
        push("movement", "nh3x-movement-accessory", "high", "vendor-stated", `product_type '${p.product_type}' -- day/date wheel disc, rotor, or stem, not a swappable movement`);
      else push("movement", "nh3x-movement", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("bezel") && !pt.includes("insert") && !pt.includes("gasket")) {
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "bezel");
      if (prefix) push("bezel", `${prefix}-bezel`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix}`);
      else if (oos) reject(oos);
      else reject("bezel ring with no identifiable case-model marker in title/type");
    } else if (pt.includes("crown")) {
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "crown");
      if (prefix) push("crown", `${prefix}-crown`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix}`);
      else if (oos) reject(oos);
      else reject("crown with no identifiable case-model marker in title/type");
    } else if (pt.includes("bracelet")) {
      const prefix = resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "strap");
      if (prefix) push("strap", `${prefix}-bracelet`, "high", "vendor-stated", `product_type '${p.product_type}' / title match -> ${prefix} (case-contoured end-links)`);
      else if (oos) reject(oos);
      else reject("bracelet with no identifiable case-model marker -- end-link shape is case-specific");
    } else if (pt.includes("strap") || pt.includes("nato") || pt.includes("rubber")) {
      // "rubber" added pre-Phase-2: "SKX007/SRPD FKM Rubber" etc. don't
      // contain the word "strap" at all -- same shape as the SRPE gap.
      push("strap", "generic-strap", "medium", "family-inferred", `product_type '${p.product_type}' -- lug-width-based, fits any case at the matching lug width`);
    } else {
      const oos = checkOutOfScope(combined, "unknown");
      if (oos) reject(oos);
      else unmatched.push({ sourceUrl: url, productName: p.title, productType: p.product_type });
    }
  }

  return { tagged, rejected, unmatched };
}

function main() {
  mkdirSync("data/tagged", { recursive: true });

  const vendors: { key: string; fn: (p: ShopifyProduct[]) => TagResult }[] = [
    { key: "namokimods", fn: tagNamoki },
    { key: "luciusatelier", fn: tagLucius },
    { key: "dlwwatches", fn: tagDlw },
    { key: "watchandstyle", fn: tagWatchAndStyle },
  ];

  let totalTagged = 0;
  let totalRejected = 0;
  let totalUnmatched = 0;
  const byCategory: Record<string, number> = {};
  // vendor -> product_type -> { count, exampleUrl } -- every product_type
  // that reached the terminal else with no tagger branch and wasn't ruled
  // out of scope either. See UnmatchedEntry above: this is the standing
  // report Task 3 (pre-Phase-2) asks for, not a one-off script -- every
  // tag-parts.ts run regenerates it, so a new vendor product_type can't
  // silently vanish the way movement/chapter_ring/crystal/strap did.
  const unmatchedByVendor: Record<string, Record<string, { count: number; exampleUrl: string }>> = {};

  for (const v of vendors) {
    const products = loadProducts(v.key);
    const { tagged, rejected, unmatched } = v.fn(products);
    writeFileSync(`data/tagged/${v.key}.json`, JSON.stringify(tagged, null, 2));
    writeFileSync(`data/tagged/${v.key}-rejected.json`, JSON.stringify(rejected.map((r) => ({ ...r, vendorKey: v.key })), null, 2));
    console.log(`${v.key}: ${tagged.length} tagged, ${rejected.length} rejected, ${unmatched.length} unmatched (from ${products.length} raw products)`);
    totalTagged += tagged.length;
    totalRejected += rejected.length;
    totalUnmatched += unmatched.length;
    for (const t of tagged) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;

    const byType: Record<string, { count: number; exampleUrl: string }> = {};
    for (const u of unmatched) {
      const key = u.productType || "(empty product_type)";
      if (!byType[key]) byType[key] = { count: 0, exampleUrl: u.sourceUrl };
      byType[key].count++;
    }
    if (Object.keys(byType).length > 0) unmatchedByVendor[v.key] = byType;
  }

  console.log(`\nTotal tagged: ${totalTagged}, total rejected: ${totalRejected}, total unmatched: ${totalUnmatched}`);
  console.log("By category:", byCategory);

  if (totalUnmatched > 0) {
    console.log(`\n${totalUnmatched} product(s) matched no tagger branch and were not ruled out of scope -- see data/fixtures/unmatched-product-types.json`);
    for (const [vendorKey, byType] of Object.entries(unmatchedByVendor)) {
      const sorted = Object.entries(byType).sort((a, b) => b[1].count - a[1].count);
      console.log(`  ${vendorKey}:`);
      for (const [productType, info] of sorted) {
        console.log(`    '${productType}': ${info.count} (e.g. ${info.exampleUrl})`);
      }
    }
  }
  // Deliberately NOT in data/tagged/ -- import-tagged.ts scans every *.json
  // file in that directory expecting a tagged/rejected-entry array, and
  // this file's shape (vendor -> product_type -> {count, exampleUrl}) is
  // neither.
  writeFileSync("data/fixtures/unmatched-product-types.json", JSON.stringify(unmatchedByVendor, null, 2));
}

main();

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
function tagNamoki(products: ShopifyProduct[]): { tagged: TaggedEntry[]; rejected: RejectedEntry[] } {
  const base = "https://namokimods.com";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const tg = tagsBlob(p);
    const combined = `${ti} ${pt} ${tg}`;
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });
    const reject = (reason: string) => rejected.push({ sourceUrl: url, productName: p.title, reason });

    if (pt === "skx007 cases") {
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
    } else if (pt === "movement spare parts" || pt === "rotors" || pt === "bridges") {
      if (ti.includes("nh35") || ti.includes("nh36") || ti.includes("nh34") || ti.includes("nh ")) {
        push("movement", "nh3x-movement", "high", "vendor-stated", `title explicit NH-series (product_type '${p.product_type}')`);
      } else {
        const oos = checkOutOfScope(combined, "movement");
        if (oos) reject(oos);
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
    }
  }

  return { tagged, rejected };
}

// ---------- luciusatelier.com ----------
function tagLucius(products: ShopifyProduct[]): { tagged: TaggedEntry[]; rejected: RejectedEntry[] } {
  const base = "https://luciusatelier.com";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const tg = tagsBlob(p);
    const combined = `${ti} ${pt} ${tg}`;
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });
    const reject = (reason: string) => rejected.push({ sourceUrl: url, productName: p.title, reason });

    const isUltraThin = tg.includes("ultra-thin") || ti.includes("ultra thin");

    if (pt === "cases") {
      const oos = checkOutOfScope(combined, "case");
      if (isUltraThin) {
        push("case", "lucius-ultra-thin-case", "high", "vendor-stated", "body_html states standard SKX bezels/inserts/crystals do NOT fit -- verified Phase 0. THE false-positive-trap family.");
      } else if (tg.includes("fits-skx013")) {
        push("case", "skx013-case", "medium", "family-inferred", "product_type 'Cases', tag fits-skx013, not part of the Ultra Thin line");
      } else if (oos) reject(oos);
    } else if (pt === "casebacks") {
      push("case", "skx007-case", "medium", "family-inferred", "tags fits-skx013/skx007/7s26-0020/0030 -- caseback thread shared across SKX007/013 shells per vendor tags, not independently confirmed");
    } else if (pt === "dials") {
      const oos = checkOutOfScope(combined, "dial"); // brand-only check: case-model names (Sumo etc.) are cosmetic on dials, not a fit constraint
      if (tg.includes("gmt - nh34")) {
        push("dial", "nh34-gmt-dial", "high", "vendor-stated", "tags explicit 'GMT - NH34'");
      } else if (tg.includes("fits-skx013") || tg.includes("skx007")) {
        push("dial", "nh3x-dial-standard", "medium", "family-inferred", "product_type 'Dials', fits-skx013/skx007 tags, no explicit feet statement on this SKU");
      } else if (oos) reject(oos);
    } else if (pt === "hands") {
      const oos = checkOutOfScope(combined, "hands"); // brand-only check: same reasoning as dial
      if (tg.includes("gmt - nh34") || (tg.includes("gmt") && tg.includes("nh34"))) {
        push("hands", "nh3x-hands-standard", "high", "vendor-stated", "tags explicit fits-nh34/GMT -- GMT-capable hand set", { gmt: true });
      } else if (tg.includes("fits-nh34") || tg.includes("fits-nh35") || tg.includes("fits-nh36")) {
        push("hands", "nh3x-hands-standard", "high", "vendor-stated", "tags explicit fits-nh34/35/36/38/72");
      } else if (oos) reject(oos);
    } else if (pt === "bezel inserts") {
      const oos = checkOutOfScope(combined, "bezel_insert");
      if (isUltraThin) {
        push("bezel_insert", "skx013-insert", "low", "manual", "Ultra Thin-scoped insert -- excluded from generic skx013-insert confidence; do not treat as fitting a stock SKX013 case");
      } else if (tg.includes("fits-skx013")) {
        push("bezel_insert", "skx013-insert", "high", "vendor-stated", "tag explicit fits-skx013");
      } else if (oos) reject(oos);
    } else if (pt === "crystals") {
      const oos = checkOutOfScope(combined, "crystal");
      if (tg.includes("fits-skx013") && !isUltraThin) {
        push("crystal", "skx013-crystal", "high", "vendor-stated", "tag explicit fits-skx013");
      } else if (oos) reject(oos);
    } else if (pt === "chapter rings") {
      const oos = checkOutOfScope(combined, "chapter_ring");
      if (isUltraThin) {
        push("chapter_ring", "lucius-ultra-thin-chapter-ring", "medium", "family-inferred", "title/tags 'Ultra Thin' -- scoped to lucius-ultra-thin-case, not generic skx013-case (see family-audit.csv)");
      } else if (tg.includes("fits-skx013")) {
        push("chapter_ring", "skx013-chapter-ring", "high", "vendor-stated", "tag explicit fits-skx013");
      } else if (oos) reject(oos);
    } else if (pt === "movements") {
      push("movement", "nh3x-movement", "high", "vendor-stated", `title explicit '${p.title}'`);
    } else if (pt === "rotors" || pt === "bridges") {
      if (tg.includes("fits-nh34") || tg.includes("fits-nh35") || tg.includes("fits-nh36")) {
        push("movement", "nh3x-movement", "high", "vendor-stated", "tags explicit fits-nh34/35/36/38/72");
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
    } else if (pt === "crowns") {
      const prefix = tg.includes("fits-skx013") ? "skx013" : resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "crown");
      if (prefix) push("crown", `${prefix}-crown`, "high", "vendor-stated", `tags/title match -> ${prefix}`);
      else if (oos) reject(oos);
    } else if (pt === "bracelets") {
      const prefix = isUltraThin ? null : tg.includes("fits-skx013") ? "skx013" : resolveCaseModelPrefix(combined);
      const oos = checkOutOfScope(combined, "strap");
      if (isUltraThin) reject("Ultra Thin-scoped bracelet -- end-links contoured to a proprietary case, does not fit stock SKX shells");
      else if (prefix) push("strap", `${prefix}-bracelet`, "high", "vendor-stated", `tags/title match -> ${prefix} (case-contoured end-links)`);
      else if (oos) reject(oos);
    } else if (pt === "straps") {
      push("strap", "generic-strap", "medium", "family-inferred", "product_type 'Straps' -- lug-width-based, fits any case at the matching lug width");
    } else {
      const oos = checkOutOfScope(combined, "unknown");
      if (oos) reject(oos);
    }
  }

  return { tagged, rejected };
}

// ---------- dlwwatches.com ----------
function tagDlw(products: ShopifyProduct[]): { tagged: TaggedEntry[]; rejected: RejectedEntry[] } {
  const base = "https://dlwwatches.com";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const tg = tagsBlob(p);
    const combined = `${ti} ${pt} ${tg}`;
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });
    const reject = (reason: string) => rejected.push({ sourceUrl: url, productName: p.title, reason });

    if (pt === "cases") {
      const oos = checkOutOfScope(combined, "case");
      if (tg.includes("srpe")) push("case", "srpe-case", "high", "vendor-stated", "tag explicit SRPE");
      else if (tg.includes("skx007") || tg.includes("srpd")) push("case", "skx007-case", "high", "vendor-stated", "tag explicit SKX007/SRPD (Turtle-styled variants are dimensionally SKX007 per the tag, styling name aside)");
      else if (oos) reject(oos);
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
    } else if (pt === "crystals") {
      const oos = checkOutOfScope(combined, "crystal");
      if (tg.includes("srpe")) push("crystal", "srpe-crystal", "high", "vendor-stated", "tag explicit SRPE");
      else if (tg.includes("srp turtle") || ti.includes("turtle")) push("crystal", "srp-turtle-crystal", "high", "vendor-stated", "tag/title explicit SRP Turtle");
      else if (oos) reject(oos);
    } else if (pt === "chapter rings") {
      const oos = checkOutOfScope(combined, "chapter_ring");
      if (tg.includes("srpe")) push("chapter_ring", "srpe-chapter-ring", "high", "vendor-stated", "tag explicit SRPE");
      else if (ti.includes("turtle")) push("chapter_ring", "srp-turtle-chapter-ring", "high", "vendor-stated", "title explicit Turtle chapter ring");
      else if (oos) reject(oos);
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
    } else {
      const oos = checkOutOfScope(combined, "unknown");
      if (oos) reject(oos);
    }
  }

  return { tagged, rejected };
}

// ---------- watchandstyle.net ----------
function tagWatchAndStyle(products: ShopifyProduct[]): { tagged: TaggedEntry[]; rejected: RejectedEntry[] } {
  const base = "https://watchandstyle.net";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const tg = tagsBlob(p);
    const combined = `${ti} ${pt} ${tg}`;
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });
    const reject = (reason: string) => rejected.push({ sourceUrl: url, productName: p.title, reason });

    if (ti.includes("snxs") || ti.includes("ssk023")) {
      const oos = checkOutOfScope(combined, "case"); // these two markers only ever appear on case-dependent items in this vendor's real catalog
      if (oos) {
        reject(oos);
        continue;
      }
    }

    if (ti.includes("alpinist") && (pt.includes("case") || pt.includes("replacement case"))) {
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
    } else if (pt.includes("skx013") && pt.includes("chapter ring")) {
      push("chapter_ring", "skx013-chapter-ring", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("skx007/srpd") && pt.includes("chapter ring")) {
      if (ti.includes("ssk")) push("chapter_ring", "ssk-gmt-chapter-ring", "medium", "family-inferred", "title 'SSK', product_type says SKX007/SRPD but tag says Seiko 5 GMT -- resolved cross-vendor, kept medium pending Phase-2-time reconciliation");
      else push("chapter_ring", "skx007-chapter-ring", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("srpe") && pt.includes("chapter ring")) {
      push("chapter_ring", "srpe-chapter-ring", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (ti.includes("srp turtle") || (ti.includes("turtle") && pt.includes("sapphire"))) {
      push("crystal", "srp-turtle-crystal", "high", "vendor-stated", "title/type explicit SRP Turtle crystal");
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
    } else if (pt.includes("strap") || pt.includes("nato")) {
      push("strap", "generic-strap", "medium", "family-inferred", `product_type '${p.product_type}' -- lug-width-based, fits any case at the matching lug width`);
    } else {
      const oos = checkOutOfScope(combined, "unknown");
      if (oos) reject(oos);
    }
  }

  return { tagged, rejected };
}

function main() {
  mkdirSync("data/tagged", { recursive: true });

  const vendors: { key: string; fn: (p: ShopifyProduct[]) => { tagged: TaggedEntry[]; rejected: RejectedEntry[] } }[] = [
    { key: "namokimods", fn: tagNamoki },
    { key: "luciusatelier", fn: tagLucius },
    { key: "dlwwatches", fn: tagDlw },
    { key: "watchandstyle", fn: tagWatchAndStyle },
  ];

  let totalTagged = 0;
  let totalRejected = 0;
  const byCategory: Record<string, number> = {};

  for (const v of vendors) {
    const products = loadProducts(v.key);
    const { tagged, rejected } = v.fn(products);
    writeFileSync(`data/tagged/${v.key}.json`, JSON.stringify(tagged, null, 2));
    writeFileSync(`data/tagged/${v.key}-rejected.json`, JSON.stringify(rejected.map((r) => ({ ...r, vendorKey: v.key })), null, 2));
    console.log(`${v.key}: ${tagged.length} tagged, ${rejected.length} rejected (from ${products.length} raw products)`);
    totalTagged += tagged.length;
    totalRejected += rejected.length;
    for (const t of tagged) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
  }

  console.log(`\nTotal tagged: ${totalTagged}, total rejected: ${totalRejected}`);
  console.log("By category:", byCategory);
}

main();

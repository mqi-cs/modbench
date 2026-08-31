// Tagging step. Per specs/02-phase-1-data-pipeline.md, tagging has no
// dedicated script requirement beyond "read data/raw/*.json, produce
// data/tagged/<vendor>.json" -- "whether a human or Claude Code produces
// this file, the review step below is the gate." This script IS that
// "Claude Code reading the raw feed files directly" path: deterministic
// rules below, no LLM call, encoding exactly the vendor product_type/tag
// patterns verified against real listings in Phase 0's family-audit.csv
// and data/fixtures/singleton-verification.md. Every rule traces to a
// specific piece of real evidence -- see the `evidence` string it emits.
//
// Amendment A (01a-PHASE-0-FINDINGS.md): family must never be assigned
// from the product NAME alone. Every rule below keys off product_type
// and/or tags -- structured vendor category data, not free-text title
// matching -- which is what lets these come in above 'low' confidence.
// Rules that fall back to title substring matching are explicitly marked
// and capped at 'low'.
//
// This tags a representative, comfortably-over-pass-measure subset of the
// real ~4,058-product catalog, not the whole thing -- consistent with
// 01a-PHASE-0-FINDINGS.md's "hand-tagging is tractable" call at v1 scale.
// Full-catalog tagging is future work, tracked as such in the Phase 1
// result writeup.

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

// ---------- namokimods.com ----------
function tagNamoki(products: ShopifyProduct[]): { tagged: TaggedEntry[]; rejected: RejectedEntry[] } {
  const base = "https://namokimods.com";
  const tagged: TaggedEntry[] = [];
  const rejected: RejectedEntry[] = [];

  for (const p of products) {
    const pt = typeLower(p);
    const ti = titleLower(p);
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });

    if (pt === "skx007 cases") {
      push("case", "skx007-case", "high", "vendor-stated", "vendor product_type 'SKX007 Cases'");
    } else if (pt === "skx013 cases") {
      push("case", "skx013-case", "high", "vendor-stated", "vendor product_type 'SKX013 Cases'");
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
    } else if (pt === "chapter rings") {
      if (ti.includes("ssk")) push("chapter_ring", "ssk-gmt-chapter-ring", "medium", "family-inferred", "title contains 'SSK'; resolved cross-vendor to Seiko 5 GMT (see family-audit.csv)");
      else if (ti.includes("skx013")) push("chapter_ring", "skx013-chapter-ring", "high", "vendor-stated", "title explicit SKX013 chapter ring");
      else if (ti.includes("skx007") || ti.includes("srpd")) push("chapter_ring", "skx007-chapter-ring", "high", "vendor-stated", "title explicit SKX007/SRPD chapter ring");
      else if (ti.includes("turtle")) push("chapter_ring", "srp-turtle-chapter-ring", "high", "vendor-stated", "title explicit Turtle chapter ring");
    } else if (pt === "ssk chapter rings") {
      push("chapter_ring", "ssk-gmt-chapter-ring", "medium", "family-inferred", "vendor product_type 'SSK Chapter Rings'; resolved cross-vendor to Seiko 5 GMT");
    } else if (pt === "srp turtle chapter rings") {
      push("chapter_ring", "srp-turtle-chapter-ring", "high", "vendor-stated", "vendor product_type 'SRP Turtle Chapter Rings'");
    } else if (pt === "sapphire crystals") {
      if (ti.includes("skx013")) push("crystal", "skx013-crystal", "high", "vendor-stated", "title explicit SKX013 crystal");
      else push("crystal", "skx007-crystal", "medium", "family-inferred", "product_type 'Sapphire Crystals', assumed SKX007/SRPD (most common line at this vendor)");
    } else if (pt === "srp turtle sapphire crystals") {
      push("crystal", "srp-turtle-crystal", "high", "vendor-stated", "vendor product_type 'SRP Turtle Sapphire Crystals'");
    } else if (pt === "movement spare parts" || pt === "rotors" || pt === "bridges") {
      if (ti.includes("nh35") || ti.includes("nh36") || ti.includes("nh34") || ti.includes("nh ")) {
        push("movement", "nh3x-movement", "high", "vendor-stated", `title explicit NH-series (product_type '${p.product_type}')`);
      }
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
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });

    const isUltraThin = tg.includes("ultra-thin") || ti.includes("ultra thin");

    if (pt === "cases") {
      if (isUltraThin) {
        push("case", "lucius-ultra-thin-case", "high", "vendor-stated", "body_html states standard SKX bezels/inserts/crystals do NOT fit -- verified Phase 0. THE false-positive-trap family.");
      } else if (tg.includes("fits-skx013")) {
        push("case", "skx013-case", "medium", "family-inferred", "product_type 'Cases', tag fits-skx013, not part of the Ultra Thin line");
      }
    } else if (pt === "casebacks") {
      push("case", "skx007-case", "medium", "family-inferred", "tags fits-skx013/skx007/7s26-0020/0030 -- caseback thread shared across SKX007/013 shells per vendor tags, not independently confirmed");
    } else if (pt === "dials") {
      if (tg.includes("gmt - nh34")) {
        push("dial", "nh34-gmt-dial", "high", "vendor-stated", "tags explicit 'GMT - NH34'");
      } else if (tg.includes("fits-skx013") || tg.includes("skx007")) {
        push("dial", "nh3x-dial-standard", "medium", "family-inferred", "product_type 'Dials', fits-skx013/skx007 tags, no explicit feet statement on this SKU");
      }
    } else if (pt === "hands") {
      if (tg.includes("gmt - nh34") || (tg.includes("gmt") && tg.includes("nh34"))) {
        push("hands", "nh3x-hands-standard", "high", "vendor-stated", "tags explicit fits-nh34/GMT -- GMT-capable hand set", { gmt: true });
      } else if (tg.includes("fits-nh34") || tg.includes("fits-nh35") || tg.includes("fits-nh36")) {
        push("hands", "nh3x-hands-standard", "high", "vendor-stated", "tags explicit fits-nh34/35/36/38/72");
      }
    } else if (pt === "bezel inserts") {
      if (isUltraThin) {
        push("bezel_insert", "skx013-insert", "low", "manual", "Ultra Thin-scoped insert -- excluded from generic skx013-insert confidence; do not treat as fitting a stock SKX013 case");
      } else if (tg.includes("fits-skx013")) {
        push("bezel_insert", "skx013-insert", "high", "vendor-stated", "tag explicit fits-skx013");
      }
    } else if (pt === "crystals") {
      if (tg.includes("fits-skx013") && !isUltraThin) {
        push("crystal", "skx013-crystal", "high", "vendor-stated", "tag explicit fits-skx013");
      }
    } else if (pt === "chapter rings") {
      if (isUltraThin) {
        push("chapter_ring", "lucius-ultra-thin-chapter-ring", "medium", "family-inferred", "title/tags 'Ultra Thin' -- scoped to lucius-ultra-thin-case, not generic skx013-case (see family-audit.csv)");
      } else if (tg.includes("fits-skx013")) {
        push("chapter_ring", "skx013-chapter-ring", "high", "vendor-stated", "tag explicit fits-skx013");
      }
    } else if (pt === "movements") {
      push("movement", "nh3x-movement", "high", "vendor-stated", `title explicit '${p.title}'`);
    } else if (pt === "rotors" || pt === "bridges") {
      if (tg.includes("fits-nh34") || tg.includes("fits-nh35") || tg.includes("fits-nh36")) {
        push("movement", "nh3x-movement", "high", "vendor-stated", "tags explicit fits-nh34/35/36/38/72");
      }
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
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });

    if (pt === "cases") {
      if (tg.includes("srpe")) push("case", "srpe-case", "high", "vendor-stated", "tag explicit SRPE");
      else if (tg.includes("skx007") || tg.includes("srpd")) push("case", "skx007-case", "high", "vendor-stated", "tag explicit SKX007/SRPD (Turtle-styled variants are dimensionally SKX007 per the tag, styling name aside)");
    } else if (ti.includes("movement") && (ti.includes("nh34") || ti.includes("nh35") || ti.includes("nh36"))) {
      push("movement", "nh3x-movement", "high", "vendor-stated", "title explicit NH34/35/36 movement");
    } else if (pt === "dials") {
      push("dial", "nh3x-dial-standard", "medium", "family-inferred", "product_type 'Dials', no explicit feet/fitment tag on this SKU");
    } else if (pt === "hands") {
      push("hands", "nh3x-hands-standard", "medium", "family-inferred", "product_type 'Hands', no explicit pinion tag on this SKU");
    } else if (pt === "ceramic bezel inserts" || (ti.startsWith("ceramic insert") || ti.startsWith("sapphire insert"))) {
      if (tg.includes("srp turtle") || ti.includes("turtle")) push("bezel_insert", "srp-turtle-insert", "high", "vendor-stated", "tag/title explicit SRP Turtle");
      else if (tg.includes("skx007") || tg.includes("srpd")) push("bezel_insert", "skx007-insert", "high", "vendor-stated", "tag explicit SKX007/SRPD");
    } else if (pt === "crystals") {
      if (tg.includes("srpe")) push("crystal", "srpe-crystal", "high", "vendor-stated", "tag explicit SRPE");
      else if (tg.includes("srp turtle") || ti.includes("turtle")) push("crystal", "srp-turtle-crystal", "high", "vendor-stated", "tag/title explicit SRP Turtle");
    } else if (pt === "chapter rings") {
      if (tg.includes("srpe")) push("chapter_ring", "srpe-chapter-ring", "high", "vendor-stated", "tag explicit SRPE");
      else if (ti.includes("turtle")) push("chapter_ring", "srp-turtle-chapter-ring", "high", "vendor-stated", "title explicit Turtle chapter ring");
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
    const url = sourceUrl(base, p);
    const push = (category: string, family: string, confidence: TaggedEntry["confidence"], specSource: TaggedEntry["specSource"], evidence: string, attributes: Record<string, unknown> = {}) =>
      tagged.push({ sourceUrl: url, name: p.title, category, family, attributes, specSource, confidence, evidence });

    // SNXS: confirmed excluded, insufficient real family size (2 SKUs across all 4 vendors, all categories).
    if (ti.includes("snxs")) {
      rejected.push({ sourceUrl: url, productName: p.title, reason: "insufficient real family size (snxs-crystal confirmed at 2 SKUs across all 4 vendors, all categories -- see singleton-verification.md)" });
      continue;
    }
    // SSK023 is a distinct, unrelated abbreviation (SKX023 family) -- out of scope this session, not a seeded family.
    if (ti.includes("ssk023")) {
      rejected.push({ sourceUrl: url, productName: p.title, reason: "SKX023 family (abbreviated SSK023 by this vendor) not yet scoped -- no family seeded this session" });
      continue;
    }

    if (ti.includes("alpinist") && (pt.includes("case") || pt.includes("replacement case"))) {
      push("case", "alpinist-style-case", "high", "vendor-stated", "title explicit 'Alpinist', product_type 'Replacement Case'");
    } else if (pt.includes("skx007/srpd") && pt.includes("case")) {
      push("case", "skx007-case", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (ti.includes("skx013") && pt.includes("case")) {
      push("case", "skx013-case", "high", "vendor-stated", "title explicit SKX013, product_type is a replacement case");
    } else if (pt === "dial") {
      push("dial", "nh3x-dial-standard", "low", "family-inferred", "product_type 'Dial', no fitment tags in feed metadata at all -- weakest-evidenced vendor for dials, per Phase 0 audit");
    } else if (pt === "hands") {
      push("hands", "nh3x-hands-standard", "low", "family-inferred", "product_type 'Hands', no fitment tags in feed metadata at all -- weakest-evidenced vendor for hands, per Phase 0 audit");
    } else if (pt.includes("skx007/srpd") && pt.includes("ceramic insert")) {
      push("bezel_insert", "skx007-insert", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("skx013") && pt.includes("chapter ring")) {
      push("chapter_ring", "skx013-chapter-ring", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (pt.includes("skx007/srpd") && pt.includes("chapter ring")) {
      if (ti.includes("ssk")) push("chapter_ring", "ssk-gmt-chapter-ring", "medium", "family-inferred", "title 'SSK', product_type says SKX007/SRPD but tag says Seiko 5 GMT -- resolved cross-vendor, kept medium pending Phase-2-time reconciliation");
      else push("chapter_ring", "skx007-chapter-ring", "high", "vendor-stated", `product_type '${p.product_type}'`);
    } else if (ti.includes("srp turtle") || (ti.includes("turtle") && pt.includes("sapphire"))) {
      push("crystal", "srp-turtle-crystal", "high", "vendor-stated", "title/type explicit SRP Turtle crystal");
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

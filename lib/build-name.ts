import type { BuildView } from "./build-view";
import { RESERVED_MODEL_TERMS } from "./trademarks";

/**
 * A readable name for a build that was never given one.
 *
 * Built from the catalog's own words -- the case family and the dial's
 * name -- rather than from any model designation. specs/06-phase-5-sharing.md
 * is explicit that trademarked model names must not appear in titles or
 * meta descriptions, and a generated title is exactly where one would
 * slip in unnoticed, so the vocabulary here is deliberately generic.
 */
const PLATFORM_WORDS: Record<string, string> = {
  skx007: "42.5mm diver",
  skx013: "37mm diver",
  "srp-turtle": "cushion-case diver",
  srpe: "modern diver",
  "ssk-gmt": "GMT diver",
  "lucius-ultra-thin": "slim diver",
  "alpinist-style": "field-style build",
};

export function describeBuild(view: BuildView): string {
  const { build, catalog } = view;
  const casePart = build.parts.case ? catalog.parts[build.parts.case] : null;
  const dial = build.parts.dial ? catalog.parts[build.parts.dial] : null;

  const platform = casePart ? Object.keys(PLATFORM_WORDS).find((p) => casePart.family.startsWith(p)) : undefined;
  const base = platform ? PLATFORM_WORDS[platform]! : "Seiko mod build";

  if (!dial) return capitalise(base);
  // The dial's own listing name, stripped of vendor SKU prefixes and
  // category boilerplate, is the most descriptive thing in the build --
  // but it is also where a trademarked model name would enter a page
  // title unnoticed, since several vendors put one straight into their
  // product titles. Reserved terms are removed here rather than checked
  // for later, so there is no path by which one reaches a <title>.
  const dialWords = stripReserved(
    dial.name
      .replace(/^[A-Z]{1,3}\d{3,5}\s*/, "")
      .replace(/\b(watch\s+)?dial\b:?/gi, "")
      .replace(/\(.*?\)/g, ""),
  );
  if (!dialWords) return capitalise(base);
  return `${dialWords} ${base}`;
}

const RESERVED_PATTERN = new RegExp(
  `\\b(?:${RESERVED_MODEL_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "gi",
);

function stripReserved(text: string): string {
  return text
    .replace(RESERVED_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-–—:\/\s]+|[-–—:\/\s]+$/g, "")
    .trim();
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

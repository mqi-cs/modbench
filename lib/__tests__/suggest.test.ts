import { describe, expect, it } from "vitest";
import { loadCatalog } from "../catalog";
import { catalogSlice } from "../build-view";
import { suggestBuilds, describeCandidate } from "../suggest";
import { EMPTY_INTENT, normaliseIntent, type ParsedIntent } from "../intent";
import { attributesToTags, checkImage, extractJson, parseWithKeywords, scrubOutput, type ImageAttributes } from "../llm";
import { STYLE_TAGS, TAG_NAMES, validateTags } from "../style-vocabulary";
import { findReservedTerms } from "../trademarks";
import { evaluateBuild } from "../compat";

const catalog = loadCatalog();
const slice = catalogSlice(catalog);

function intent(over: Partial<ParsedIntent> = {}): ParsedIntent {
  return { ...EMPTY_INTENT, ...over };
}

// specs/07-phase-6-nl-image-input.md pass measure 1: "20 hand-written
// natural language queries produce at least one valid build each."
const QUERIES = [
  "something like a white textured dial diver under £400",
  "black dive watch, cheap as possible",
  "a green sunburst dial with sword hands",
  "gmt with a two tone bezel",
  "vintage looking diver with aged lume",
  "cream dial, roman numerals, dressy",
  "sterile military dial, no branding",
  "blue dial with a date window under £350",
  "bronze coloured tool watch",
  "grey matte dial, plain bezel",
  "gold tone dressy build with dauphine hands",
  "orange dial diver",
  "pilot style with arabic numerals",
  "ceramic bezel, black, lumed",
  "mother of pearl dial",
  "red and blue bezel gmt traveller",
  "skeleton hands with a black dial",
  "yellow dial under 300 pounds",
  "enamel dial, no date",
  "42mm diver with a count up bezel",
];

describe("natural language queries", () => {
  for (const query of QUERIES) {
    it(`"${query}" produces at least one build`, () => {
      const parsed = parseWithKeywords(query);
      const candidates = suggestBuilds(parsed, slice);
      expect(candidates.length, `parsed tags: ${parsed.styleTags.join(", ") || "(none)"}`).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(Object.keys(candidate.parts).length).toBeGreaterThanOrEqual(3);
        expect(candidate.totalMinorBase).toBeGreaterThan(0);
      }
    });
  }

  it("understands most of them well enough to constrain the search", () => {
    // Not every query maps to a tag -- "cheap as possible" is a sort
    // order, not a style -- but if the keyword parser understood almost
    // none of them the vocabulary would be the problem, not the model.
    const understood = QUERIES.filter((q) => parseWithKeywords(q).styleTags.length > 0);
    expect(understood.length).toBeGreaterThanOrEqual(18);
  });

  it("reads budgets and sizes out of the text", () => {
    expect(parseWithKeywords("under £400").budgetMinor).toBe(40000);
    expect(parseWithKeywords("under 300 pounds").budgetMinor).toBe(30000);
    expect(parseWithKeywords("42mm diver").caseDiameterMm).toEqual([40, 44]);
    expect(parseWithKeywords("no date please").requiresDate).toBe(false);
    expect(parseWithKeywords("with a date window").requiresDate).toBe(true);
    expect(parseWithKeywords("gmt for a second time zone").requiresGmt).toBe(true);
  });
});

// Pass measure 2: "Zero blocked builds ever surface from either feature."
describe("blocked builds never surface", () => {
  it("discards every blocked candidate, across all queries and the whole vocabulary", () => {
    const intents = [
      ...QUERIES.map(parseWithKeywords),
      ...TAG_NAMES.map((tag) => intent({ styleTags: [tag] })),
      intent(),
      intent({ styleTags: TAG_NAMES }),
      intent({ requiresGmt: true }),
      intent({ requiresDate: false }),
      intent({ budgetMinor: 5000 }),
    ];
    let checked = 0;
    for (const parsed of intents) {
      for (const candidate of suggestBuilds(parsed, slice)) {
        // Re-evaluated here rather than trusting the filter inside
        // suggestBuilds, so the assertion is independent of the code it
        // is checking.
        expect(evaluateBuild({ parts: candidate.parts }, slice).status).not.toBe("blocked");
        checked++;
      }
    }
    expect(checked, "no candidates were produced at all, so this proved nothing").toBeGreaterThan(50);
  });

  it("respects a budget rather than showing something unaffordable", () => {
    for (const candidate of suggestBuilds(intent({ budgetMinor: 8000 }), slice)) {
      expect(candidate.totalMinorBase).toBeLessThanOrEqual(8000);
    }
  });
});

// Pass measure 3: "No invented style tags. Feed 20 adversarial queries
// using vocabulary outside the controlled list; confirm all are dropped
// or mapped, never passed through."
describe("invented tags are dropped", () => {
  const ADVERSARIAL = [
    "submariner", "rolex", "seamaster", "panda-dial", "meteorite", "tiffany-blue",
    "salmon", "smiley", "big-crown", "no-radiation", "tropical-patina-gilt",
    "BLACK", " black ", "black;drop table parts", "__proto__", "constructor",
    "diver's", "sunburst-blue", "arabic numerals", "",
  ];

  it("passes through only exact vocabulary members", () => {
    const { intent: normalised, droppedTags } = normaliseIntent({
      ...EMPTY_INTENT,
      styleTags: ADVERSARIAL,
    });
    // Case and surrounding whitespace are normalised, so those two are
    // legitimately kept as "black". Everything else is invented.
    expect(normalised.styleTags).toEqual(["black"]);
    for (const tag of normalised.styleTags) expect(TAG_NAMES).toContain(tag);
    // The user is told what was ignored rather than silently getting
    // narrower results.
    expect(droppedTags).toContain("submariner");
    expect(droppedTags).toContain("__proto__");
    expect(droppedTags.length).toBeGreaterThan(10);
  });

  it("drops non-strings, duplicates and prototype keys", () => {
    expect(validateTags(["black", "black", "BLACK"])).toEqual(["black"]);
    expect(validateTags([null, 42, {}, [], undefined])).toEqual([]);
    expect(validateTags("black")).toEqual([]);
    expect(validateTags(["__proto__", "constructor", "toString", "hasOwnProperty"])).toEqual([]);
  });

  it("rejects a whole intent whose shape is wrong rather than partially trusting it", () => {
    expect(normaliseIntent({ styleTags: ["black"] }).intent.styleTags).toEqual([]);
    expect(normaliseIntent(null).intent).toEqual(EMPTY_INTENT);
    expect(normaliseIntent("black").intent).toEqual(EMPTY_INTENT);
  });

  it("throws out an impossible case-size range instead of querying with it", () => {
    expect(normaliseIntent({ ...EMPTY_INTENT, caseDiameterMm: [44, 40] }).intent.caseDiameterMm).toBeNull();
    expect(normaliseIntent({ ...EMPTY_INTENT, caseDiameterMm: [1, 500] }).intent.caseDiameterMm).toBeNull();
    expect(normaliseIntent({ ...EMPTY_INTENT, caseDiameterMm: [38, 42] }).intent.caseDiameterMm).toEqual([38, 42]);
  });
});

// Pass measure 5: "No brand or model name appears in any output from
// either feature."
describe("no brand or model names in output", () => {
  it("carries none in the vocabulary itself", () => {
    for (const tag of STYLE_TAGS) {
      expect(findReservedTerms(tag.tag), `tag ${tag.tag}`).toEqual([]);
      expect(findReservedTerms(tag.label), `label of ${tag.tag}`).toEqual([]);
    }
  });

  it("carries none in any generated explanation, across every query", () => {
    for (const query of QUERIES) {
      for (const candidate of suggestBuilds(parseWithKeywords(query), slice)) {
        expect(findReservedTerms(describeCandidate(candidate)), `query: ${query}`).toEqual([]);
      }
    }
  });

  it("strips them from model output even when the model ignores the instruction", () => {
    // The prompt asks; this enforces. Model output is not trusted to
    // follow an instruction that carries a legal caution.
    const scrubbed = scrubOutput({
      dialColour: "Submariner black",
      note: "Looks like a Rolex Explorer with Mercedes hands",
      nested: ["a Pepsi bezel", { deep: "Seamaster" }],
    });
    expect(findReservedTerms(JSON.stringify(scrubbed))).toEqual([]);
    expect(scrubbed.dialColour).toBe("black");
  });
});

describe("image input", () => {
  // Pass measure: "validate magic bytes not just the extension".
  it("validates by magic bytes, not by what the caller claims", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(checkImage(png)).toMatchObject({ ok: true, mime: "image/png" });
    expect(checkImage(jpeg)).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(checkImage(webp)).toMatchObject({ ok: true, mime: "image/webp" });

    // A PDF, an SVG and a shell script all fail regardless of filename.
    expect(checkImage(new Uint8Array([0x25, 0x50, 0x44, 0x46])).ok).toBe(false);
    expect(checkImage(new TextEncoder().encode("<svg xmlns=")).ok).toBe(false);
    expect(checkImage(new TextEncoder().encode("#!/bin/sh\nrm -rf /")).ok).toBe(false);
    expect(checkImage(new Uint8Array(0)).ok).toBe(false);
  });

  it("enforces the 10MB cap", () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(checkImage(big)).toMatchObject({ ok: false });
  });

  it("maps extracted attributes onto the controlled vocabulary and nothing else", () => {
    const attributes: ImageAttributes = {
      dialColour: "deep blue",
      dialTexture: "sunburst",
      indexStyle: "arabic",
      handStyle: "mercedes",
      bezelType: "dive",
      approxCaseSizeMm: 40,
      confidence: { dialColour: "high", dialTexture: "high", indexStyle: "high", handStyle: "medium", bezelType: "high", approxCaseSizeMm: "low" },
    };
    const tags = attributesToTags(attributes);
    expect(tags).toContain("blue");
    expect(tags).toContain("sunburst");
    expect(tags).toContain("arabic-numerals");
    expect(tags).toContain("three-lobe-hands");
    expect(tags).toContain("dive-bezel");
    for (const tag of tags) expect(TAG_NAMES).toContain(tag);
  });

  it("excludes low-confidence attributes until they are confirmed", () => {
    const base: ImageAttributes = {
      dialColour: "green", dialTexture: null, indexStyle: null, handStyle: "sword", bezelType: null, approxCaseSizeMm: null,
      confidence: { dialColour: "low", dialTexture: "low", indexStyle: "low", handStyle: "high", bezelType: "low", approxCaseSizeMm: "low" },
    };
    expect(attributesToTags(base)).toEqual(["sword-hands"]);
    // ...and includes them once the user confirms.
    expect(attributesToTags(base, true)).toContain("green");
  });
});

// Pass measure 6: "Both features fail gracefully with the API key removed."
describe("degrading without a model", () => {
  it("still parses and still returns builds", () => {
    // The whole suite runs without ANTHROPIC_API_KEY set, so every test
    // above is already exercising this path -- this states it outright.
    expect(process.env.ANTHROPIC_API_KEY).toBeFalsy();
    const parsed = parseWithKeywords("black dive bezel under £300");
    expect(parsed.styleTags).toContain("black");
    expect(parsed.styleTags).toContain("dive-bezel");
    expect(parsed.budgetMinor).toBe(30000);
    expect(suggestBuilds(parsed, slice).length).toBeGreaterThan(0);
  });

  it("recovers a JSON object from a reply wrapped in prose or a code fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here you go: {"a":1} Hope that helps.')).toEqual({ a: 1 });
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson('{"a": broken')).toBeNull();
  });
});

describe("candidate quality", () => {
  it("returns distinct builds rather than the same one three times", () => {
    const candidates = suggestBuilds(intent({ styleTags: ["black", "dive-bezel"] }), slice);
    expect(candidates.length).toBeGreaterThan(1);
    const keys = candidates.map((c) => Object.values(c.parts).join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("says which requested tags it could not satisfy", () => {
    // Honesty about a partial match matters more here than anywhere: the
    // user asked for something specific and is getting an approximation.
    const candidates = suggestBuilds(intent({ styleTags: ["mother-of-pearl", "roman-numerals", "gmt-bezel"] }), slice);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect([...candidate.tagsMatched, ...candidate.tagsMissed].sort()).toEqual(["gmt-bezel", "mother-of-pearl", "roman-numerals"]);
      expect(describeCandidate(candidate).length).toBeGreaterThan(20);
    }
  });

  it("prefers parts that actually match over cheaper ones that do not", () => {
    const green = suggestBuilds(intent({ styleTags: ["green"] }), slice);
    expect(green[0]!.tagsMatched).toContain("green");
  });
});

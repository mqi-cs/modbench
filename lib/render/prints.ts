// Which print each printed layer uses for a build (WS2c). Pure.
//
// Dial: the vendor's own photo, where one is prepared (public/assets/dial,
// framed at 28.5mm across the renderer's 48.4mm dial UV span). Insert,
// chapter ring and date wheel: generic generated prints (public/render/prints)
// chosen by colour -- no catalog photo of those is usable (inserts are shot
// lume-lit, rings at three-quarters; scripts/3d-test/REPORT.md), so each is
// flagged `generated` and the scene labels it.
//
// The colour comes from the vendor's listing name ("Polished Gold", "Seiko
// style Batman", "Matte Black Finish with Yellow Markers"): the style tags
// don't cover chapter rings and can't say which colour is the body and which
// the markings. The palette is closed (PRINTS), so every key printColours
// returns names a file scripts/render/make-prints.ts has drawn.

import type { Print } from "./scene";
import { INTEGRATED_RING_PRINT, ringStatus } from "./standins";

/** Print colours, as the real part looks (sRGB). The renderer lights them. */
export const TONES = {
  black: "#111214",
  grey: "#4a4d51",
  silver: "#a9adb1",
  white: "#e8e8e3",
  cream: "#e3d8bd",
  gold: "#b8954a",
  rose: "#c49383",
  yellow: "#e0b62a",
  orange: "#d0601c",
  red: "#a31f24",
  burgundy: "#5c1a22",
  brown: "#5a3a22",
  green: "#1e5a32",
  blue: "#1f408f",
  navy: "#17233f",
  purple: "#4b2a6b",
} as const;
export type Tone = keyof typeof TONES;

/** Marking colours. Anything else a name asks for is drawn white on a dark body, black on a light one. */
export const INKS = { white: "#f2f1ea", black: "#141414", gold: "#d9b566", grey: "#8a8d90" } as const;
type Ink = keyof typeof INKS;

/** Two-tone bezels drawn split, top half first. Other pairs draw their first colour. */
const SPLITS: [Tone, Tone][] = [
  ["red", "blue"], ["blue", "red"],
  ...(["red", "blue", "green", "brown", "grey", "yellow", "orange"] as const).flatMap((t): [Tone, Tone][] => [["black", t], [t, "black"]]),
];

// Longer phrases first: each match is blanked out so "rose gold" isn't also gold.
const WORDS: [RegExp, Tone][] = [
  [/\brose\s?gold\b|\bsalmon\s?gold\b/gi, "rose"],
  [/\byellow\s?gold\b/gi, "gold"],
  [/\b(?:dark|midnight)\s?blue\b|\bnavy\b/gi, "navy"],
  [/\bblack\b|\bonyx\b|\bnoir\b/gi, "black"],
  [/\bgr[ae]y\b|\bslate\b|\bgun\s?metal\b|\bcharcoal\b/gi, "grey"],
  [/\bsilver\b|\bsteel\b|\bstainless\b|\brhodium\b/gi, "silver"],
  [/\bwhite\b|\bsnow\b|\barctic\b/gi, "white"],
  [/\bcream\b|\bivory\b|\bbeige\b|\bbiege\b|\becru\b/gi, "cream"],
  [/\bgold\b|\bgilt\b|\bbrass\b/gi, "gold"],
  [/\byellow\b|\bmustard\b/gi, "yellow"],
  [/\borange\b|\bamber\b/gi, "orange"],
  [/\bburgundy\b|\bmaroon\b|\bwine\b|\bbordeaux\b/gi, "burgundy"],
  [/\bred\b|\bcherry\b/gi, "red"],
  [/\bbrown\b|\bbronze\b|\bcopper\b|\bchocolate\b|\bumber\b/gi, "brown"],
  [/\bgreen\b|\bolive\b|\bemerald\b|\bjade\b|\blime\b/gi, "green"],
  [/\bblue\b|\bcobalt\b|\baegean\b|\bsky\b/gi, "blue"],
  [/\bpurple\b|\bviolet\b/gi, "purple"],
];

// Bezel nicknames, which override colour words. Split order is the
// original's top half first, fixed rather than read from the name: vendors
// write Pepsi both "Red/Blue" and "Blue/Red".
const NICKNAMES: [RegExp, Tone, Tone | null, Ink | null][] = [
  [/\bpepsi\b/i, "red", "blue", null],
  [/\bcoke\b/i, "red", "black", null],
  [/\bbat(?:man)?\b/i, "black", "blue", null],
  [/\broot\s?beer\b/i, "black", "brown", null],
  [/\bsprite\b/i, "green", "black", null],
  [/\bbumblebee\b/i, "black", "yellow", null],
  [/\bbruce\s?wayne\b/i, "black", "grey", null],
  [/\bstealth\b|\bcarbon\b/i, "black", null, "grey"],
  // Black with coloured markings; the marking colours aren't in INKS.
  [/\bblack\s+series\b/i, "black", null, null],
];

const LIGHT: ReadonlySet<Tone> = new Set(["silver", "white", "cream", "gold", "rose", "yellow", "orange"]);
const AS_INK: Partial<Record<Tone, Ink>> = { white: "white", cream: "white", silver: "white", gold: "gold", black: "black", grey: "grey" };

/** Markings that wouldn't show on this body; grey is only the stealth look, on black. */
const clashes = (bg: Tone, ink: Ink) =>
  ink === bg || (ink === "white" && (bg === "white" || bg === "cream" || bg === "silver")) || (ink === "gold" && (bg === "gold" || bg === "rose" || bg === "yellow")) || (ink === "grey" && bg !== "black");

export interface PrintColours {
  bg: Tone;
  bg2?: Tone;
  ink: Ink;
}

export const printKey = (slot: "insert" | "ring", c: PrintColours) => `${slot}-${c.bg}${c.bg2 ? `-${c.bg2}` : ""}-${c.ink}`;

/** Every print the preview can ask for: what make-prints.ts draws. */
export const PRINTS: { key: string; slot: "insert" | "ring"; colours: PrintColours }[] = (["insert", "ring"] as const).flatMap((slot) =>
  [
    ...(Object.keys(TONES) as Tone[]).flatMap((bg) => (Object.keys(INKS) as Ink[]).filter((ink) => !clashes(bg, ink)).map((ink): PrintColours => ({ bg, ink }))),
    ...SPLITS.map(([bg, bg2]): PrintColours => ({ bg, bg2, ink: "white" })),
  ].map((colours) => ({ key: printKey(slot, colours), slot, colours })),
);

/** An insert's or chapter ring's body and marking colours, from its listing name. */
export function printColours(slot: "insert" | "ring", name: string): PrintColours {
  // An insert's material isn't its colour: "Steel Bezel Insert: ... Red" is red.
  let s = slot === "insert" ? name.replace(/\b(?:stainless\s+)?(?:steel|stainless)\s+(?:bezel\s+)?insert\b/gi, (m) => " ".repeat(m.length)) : name;
  const steelInsert = s !== name;
  const hits: { tone: Tone; at: number; marker: boolean }[] = [];
  for (const [re, tone] of WORDS) {
    s = s.replace(re, (m: string, at: number) => {
      // "with Yellow Markers", "- Black Numerals", "w Markers (White)"
      const marker = /^\W*(?:markers?|numerals?|indices)\b/i.test(name.slice(at + m.length)) || /markers?\s*\(\s*$/i.test(name.slice(0, at));
      hits.push({ tone, at, marker });
      return " ".repeat(m.length);
    });
  }
  hits.sort((a, b) => a.at - b.at);
  const body = hits.filter((h) => !h.marker).map((h) => h.tone);
  const markerTone = hits.find((h) => h.marker)?.tone;

  let bg: Tone = slot === "ring" || steelInsert ? "silver" : "black";
  let bg2: Tone | undefined;
  let ink: Ink | undefined = markerTone ? AS_INK[markerTone] : undefined;
  const nick = NICKNAMES.find(([re]) => re.test(name));
  if (nick) {
    bg = nick[1];
    bg2 = nick[2] ?? undefined;
    ink = nick[3] ?? ink;
  } else if (body.length) {
    bg = body[0]!;
    const second = body.find((t) => t !== bg);
    if (second && SPLITS.some(([a, b]) => a === bg && b === second)) bg2 = second;
    // "Black/Gold", "Green/White", "Umber X Gold": the second colour is the printing.
    else if (second && !ink && AS_INK[second] && second !== "black") ink = AS_INK[second];
  }
  if (bg2) return { bg, bg2, ink: "white" };
  if (!ink || clashes(bg, ink)) ink = LIGHT.has(bg) ? "black" : "white";
  return { bg, ink };
}

export function printsFor(
  parts: Partial<Record<string, string>>,
  partOf: (id: string) => { name: string; attributes: Record<string, unknown> } | undefined,
  hasDialPhoto: (id: string) => boolean,
): Partial<Record<"dial" | "date" | "ring" | "insert", Print>> {
  const out: Partial<Record<"dial" | "date" | "ring" | "insert", Print>> = {};
  const src = (slot: "insert" | "ring", id: string) => `/render/prints/${printKey(slot, printColours(slot, partOf(id)?.name ?? ""))}.webp`;
  if (parts.dial && hasDialPhoto(parts.dial)) {
    out.dial = { src: `/assets/dial/${parts.dial}.webp`, generated: false };
    out.date = { src: "/render/prints/date-skx.webp", generated: true };
  }
  if (parts.bezelInsert) out.insert = { src: src("insert", parts.bezelInsert), generated: true };
  if (parts.chapterRing) out.ring = { src: src("ring", parts.chapterRing), generated: true };
  else if (parts.case && ringStatus(partOf(parts.case)?.attributes) === "integrated") out.ring = { src: INTEGRATED_RING_PRINT, generated: true };
  return out;
}

// Pure raster analysis for offline asset preparation.
//
// No sharp, no filesystem, no network: everything here takes a plain RGBA
// buffer and returns numbers, so the classification decisions that gate
// `assetState` are unit-testable without fixtures on disk.
//
// The job is not "remove the background" -- it is "decide whether this
// photograph is the part, alone, flat-on". Vendor photography in this
// catalog includes wrist shots, lifestyle shots on wood, colour-variant
// montages, and (for bezel inserts) renders of the insert fitted to a
// whole watch. Every one of those would silently produce a plausible-
// looking, wrong asset, so the measures below exist to reject them rather
// than to clean them up.

export interface Raster {
  data: Uint8Array | Uint8ClampedArray; // RGBA, row-major
  width: number;
  height: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface BackgroundProbe {
  color: Rgb;
  /** Fraction of border pixels within tolerance of `color`. */
  agreement: number;
}

export interface Component {
  /** Pixel count. */
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  /** Enclosed background regions (pivot holes, insert centres). */
  holes: Hole[];
  /** Index into the components array. Matches the value stored in `labels`. */
  label: number;
}

export interface Hole {
  area: number;
  cx: number;
  cy: number;
  radius: number;
  /** Component this hole is enclosed by, or -1 if it touches none. */
  owner: number;
  /** Bounding-box aspect, width / height. ~1 for a drilled hole. */
  aspect: number;
  /** area / bounding-box area. ~pi/4 for a circle, ~1 for a printed stripe. */
  fill: number;
}

export function px(img: Raster, x: number, y: number): Rgb {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i]!, g: img.data[i + 1]!, b: img.data[i + 2]! };
}

/** Chebyshev distance in RGB. Cheap, and adequate for "is this the seamless backdrop". */
export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

/**
 * The backdrop colour, and how much of the border actually agrees with it.
 *
 * Low agreement is the signal that separates a seamless studio backdrop
 * from a photograph taken on a desk, a wrist, or a slab of wood. That
 * distinction cannot be recovered later -- once a flood fill runs against
 * a backdrop that isn't uniform it eats part of the subject or none of it
 * -- so it is measured first and used to reject, not to correct.
 */
export function probeBackground(img: Raster, tolerance = 18): BackgroundProbe {
  const border: Rgb[] = [];
  const step = Math.max(1, Math.floor(Math.min(img.width, img.height) / 100));
  for (let x = 0; x < img.width; x += step) {
    border.push(px(img, x, 0), px(img, x, img.height - 1));
  }
  for (let y = 0; y < img.height; y += step) {
    border.push(px(img, 0, y), px(img, img.width - 1, y));
  }

  // Modal colour by agreement count rather than mean: a mean over a wood
  // background and a white vignette lands on a colour present nowhere in
  // the image, which then floods nothing.
  let best = border[0]!;
  let bestCount = -1;
  for (const candidate of border) {
    let count = 0;
    for (const other of border) if (colorDistance(candidate, other) <= tolerance) count++;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return { color: best, agreement: bestCount / border.length };
}

/**
 * How close to the backdrop colour a pixel must be for the flood to cross
 * it.
 *
 * Tuned, not guessed. At 22 the flood walked straight through the outer
 * edge of white and silver dials -- which is where contrast against a
 * white studio backdrop is lowest -- eating enough of the disc that 49
 * good dials failed the shape test as "not disc shaped". Sweeping the
 * whole catalog at 22 / 14 / 10 / 7 put dials at 63.7 / 69.8 / 71.7 /
 * 74.5 percent ready, while hands and chapter rings peaked at 10 and fell
 * off at 7 as darker edges started to fray. 10 is the joint best.
 */
export const FLOOD_TOLERANCE = 10;

/**
 * Subject mask by flood fill inward from the border.
 *
 * Deliberately a flood and not a global colour threshold: a white dial on
 * a white backdrop is separated by the dial's own edge, and a global
 * threshold would erase the dial face while a flood stops at it. Same
 * reason lume plots and printed white text survive.
 */
export function subjectMask(img: Raster, bg: Rgb, tolerance = FLOOD_TOLERANCE): Uint8Array {
  const { width: w, height: h } = img;
  const mask = new Uint8Array(w * h).fill(1); // 1 = subject until proven background
  const stack: number[] = [];
  const pushIfBg = (x: number, y: number) => {
    const i = y * w + x;
    if (mask[i] === 0) return;
    if (colorDistance(px(img, x, y), bg) > tolerance) return;
    mask[i] = 0;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushIfBg(0, y);
    pushIfBg(w - 1, y);
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) pushIfBg(x - 1, y);
    if (x < w - 1) pushIfBg(x + 1, y);
    if (y > 0) pushIfBg(x, y - 1);
    if (y < h - 1) pushIfBg(x, y + 1);
  }
  return mask;
}

export interface Labelling {
  components: Component[];
  /** Per-pixel component index, -1 for background. Indexes into `components`. */
  labels: Int32Array;
}

/** 4-connected labelling of subject pixels, largest first, specks dropped. */
export function findComponents(mask: Uint8Array, w: number, h: number, minArea = 64): Labelling {
  const label = new Int32Array(w * h).fill(-1);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (mask[seed] !== 1 || label[seed] !== -1) continue;
    const id = out.length;
    let area = 0, sx = 0, sy = 0;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    label[seed] = id;
    stack.push(seed);
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const push = (nx: number, ny: number) => {
        const j = ny * w + nx;
        if (mask[j] === 1 && label[j] === -1) {
          label[j] = id;
          stack.push(j);
        }
      };
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    if (area >= minArea) {
      out.push({ area, minX, minY, maxX, maxY, cx: sx / area, cy: sy / area, holes: [], label: id });
    }
  }
  // Sorting reorders the array, so the label array is remapped to match --
  // callers index `components` by the value they read out of `labels`, and
  // a stale mapping would silently attribute one hand's pixels to another.
  const sorted = [...out].sort((a, b) => b.area - a.area);
  const remap = new Int32Array(out.length).fill(-1);
  for (const [newIndex, comp] of sorted.entries()) remap[comp.label] = newIndex;
  for (let i = 0; i < label.length; i++) {
    const l = label[i]!;
    label[i] = l === -1 ? -1 : remap[l]!;
  }
  for (const [i, c] of sorted.entries()) c.label = i;
  return { components: sorted, labels: label };
}

/**
 * Background regions the border flood could not reach -- i.e. enclosed by
 * subject. The centre of a bezel insert and the pivot hole of a hand are
 * both holes, and both are load-bearing: an insert without a hole is not
 * an insert (it is a photograph of an assembled watch), and a hand
 * without one cannot be positioned because its axis of rotation is
 * unknown.
 */
export function findHoles(mask: Uint8Array, labels: Int32Array, w: number, h: number, minArea = 12): Hole[] {
  const enclosed = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) enclosed[i] = mask[i] === 2 ? 1 : 0;
  const out: Hole[] = [];
  const stack: number[] = [];
  for (let seed = 0; seed < enclosed.length; seed++) {
    if (enclosed[seed] !== 1) continue;
    let area = 0, sx = 0, sy = 0;
    let hMinX = w, hMinY = h, hMaxX = -1, hMaxY = -1;
    // Ownership is decided by which component's pixels border the hole,
    // not by which bounding box contains it. Hands photographed as a loose
    // set overlap heavily in bounding box -- one probe put seven of one
    // hand's holes on its neighbour -- and a hole attributed to the wrong
    // hand puts that hand's pivot in empty space.
    const touching = new Map<number, number>();
    enclosed[seed] = 0;
    stack.push(seed);
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      area++;
      sx += x;
      sy += y;
      if (x < hMinX) hMinX = x;
      if (x > hMaxX) hMaxX = x;
      if (y < hMinY) hMinY = y;
      if (y > hMaxY) hMaxY = y;
      const visit = (nx: number, ny: number) => {
        const j = ny * w + nx;
        if (enclosed[j] === 1) {
          enclosed[j] = 0;
          stack.push(j);
          return;
        }
        const l = labels[j]!;
        if (l >= 0) touching.set(l, (touching.get(l) ?? 0) + 1);
      };
      if (x > 0) visit(x - 1, y);
      if (x < w - 1) visit(x + 1, y);
      if (y > 0) visit(x, y - 1);
      if (y < h - 1) visit(x, y + 1);
    }
    if (area < minArea) continue;
    let owner = -1;
    let bestTouch = 0;
    for (const [l, n] of touching) {
      if (n > bestTouch) {
        bestTouch = n;
        owner = l;
      }
    }
    const bw = hMaxX - hMinX + 1;
    const bh = hMaxY - hMinY + 1;
    out.push({ area, cx: sx / area, cy: sy / area, radius: Math.sqrt(area / Math.PI), owner, aspect: bw / bh, fill: area / (bw * bh) });
  }
  return out.sort((a, b) => b.area - a.area);
}

/** Attaches each hole to the component that encloses it. */
export function assignHoles(components: Component[], holes: Hole[]): void {
  for (const hole of holes) {
    const owner = components[hole.owner];
    if (owner) owner.holes.push(hole);
  }
  for (const c of components) c.holes.sort((a, b) => b.area - a.area);
}

/**
 * Marks enclosed background as 2, leaving border-reachable background as 0.
 * Run after subjectMask; the two together give a three-way classification
 * (outside / subject / hole) that both the shape tests and the alpha
 * channel are derived from.
 */
export function markEnclosed(img: Raster, mask: Uint8Array, bg: Rgb, tolerance = FLOOD_TOLERANCE): void {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) continue;
    const x = i % img.width;
    const y = (i - x) / img.width;
    if (colorDistance(px(img, x, y), bg) <= tolerance) mask[i] = 2;
  }
}

export interface ShapeMeasures {
  /** Bounding-box aspect, width / height. 1 for a disc. */
  aspect: number;
  /** area / bbox area. pi/4 ~= 0.785 for a disc inscribed in its bbox. */
  fill: number;
  /** Largest hole radius / outer radius. ~0 for a disc, ~0.8 for an insert. */
  holeRatio: number;
  /** Subject area as a fraction of the whole frame. */
  coverage: number;
}

export function measure(comp: Component, w: number, h: number): ShapeMeasures {
  const bw = comp.maxX - comp.minX + 1;
  const bh = comp.maxY - comp.minY + 1;
  const outerRadius = Math.max(bw, bh) / 2;
  const largestHole = comp.holes[0];
  return {
    aspect: bw / bh,
    fill: comp.area / (bw * bh),
    holeRatio: largestHole ? largestHole.radius / outerRadius : 0,
    coverage: comp.area / (w * h),
  };
}

// --- Hand geometry -------------------------------------------------------
//
// A hand set is photographed as loose parts lying at whatever angle they
// were dropped, so to draw one on a dial the pipeline has to recover, per
// hand, the axis it points along and the point it rotates about. Both come
// out of image moments plus the pivot hole, and neither is available from
// any vendor field.

export interface HandGeometry {
  /** Pivot in raster coordinates: the centre of rotation. */
  pivotX: number;
  pivotY: number;
  /** Tip: the far end of the hand along its principal axis. */
  tipX: number;
  tipY: number;
  /** Distance pivot -> tip, i.e. the drawn length of the hand. */
  length: number;
  /** Mean half-width along the axis. Separates a seconds hand from an hour hand. */
  thickness: number;
  /** True when the pivot came from a detected hole rather than the mass estimate. */
  pivotFromHole: boolean;
  /**
   * Material behind the pivot divided by material in front of it. A real
   * hand is close to one-sided -- a boss and a small counterweight behind,
   * the whole hand in front -- so a value near 1 means the pivot landed
   * mid-shaft and the hand would be drawn as a bar straight through the
   * centre of the dial rather than radiating from it.
   */
  tailRatio: number;
}

/** A drilled hole is round; printed lume and engraved text are not. */
export function isRoundish(hole: Hole): boolean {
  return hole.aspect >= 0.6 && hole.aspect <= 1.67 && hole.fill >= 0.55 && hole.fill <= 0.95;
}

/**
 * Principal axis by second moments, then the two extreme points along it.
 *
 * Using moments rather than the bounding box matters because a hand lying
 * diagonally has a bounding box whose corners are empty space -- the box's
 * centre is not on the hand, and its diagonal is not the hand's length.
 */
export function handGeometry(comp: Component, labels: Int32Array, w: number, h: number): HandGeometry {
  let mxx = 0, myy = 0, mxy = 0;
  for (let y = comp.minY; y <= comp.maxY; y++) {
    for (let x = comp.minX; x <= comp.maxX; x++) {
      if (labels[y * w + x] !== comp.label) continue;
      const dx = x - comp.cx;
      const dy = y - comp.cy;
      mxx += dx * dx;
      myy += dy * dy;
      mxy += dx * dy;
    }
  }
  const theta = 0.5 * Math.atan2(2 * mxy, mxx - myy);
  const ax = Math.cos(theta);
  const ay = Math.sin(theta);

  let tMin = Infinity, tMax = -Infinity;
  let sumAbsPerp = 0, n = 0;
  for (let y = comp.minY; y <= comp.maxY; y++) {
    for (let x = comp.minX; x <= comp.maxX; x++) {
      if (labels[y * w + x] !== comp.label) continue;
      const dx = x - comp.cx;
      const dy = y - comp.cy;
      const t = dx * ax + dy * ay;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
      sumAbsPerp += Math.abs(-dx * ay + dy * ax);
      n++;
    }
  }
  const thickness = n > 0 ? (2 * sumAbsPerp) / n : 0;

  const at = (t: number) => ({ x: comp.cx + ax * t, y: comp.cy + ay * t });
  const endA = at(tMin);
  const endB = at(tMax);

  // Which end is the pivot? The hole, when there is one: a pivot hole sits
  // on the mounting boss, which is always the tail. Failing that, the tail
  // is the heavier end -- the boss and counterweight put more material
  // behind the pivot than the taper leaves in front of it.
  // Not simply the largest hole. On a lumed hand the biggest enclosed
  // region is the lume cavity, which sits mid-shaft -- taking it as the
  // pivot put the centre of rotation halfway along the hand, and the
  // finished asset showed hands crossed in an X with tails sticking out
  // as far as the tips. A mounting hole is near an end and roughly round,
  // so both are required.
  const axisExtent = Math.max(1, tMax - tMin);
  const pivotHole = comp.holes
    .filter((hole) => {
      const t = (hole.cx - comp.cx) * ax + (hole.cy - comp.cy) * ay;
      const fromEnd = Math.min(Math.abs(t - tMin), Math.abs(t - tMax));
      if (fromEnd / axisExtent > 0.3) return false;
      // Roundness, not just position. A lume stripe running up the shaft
      // is enclosed background too, and on a gold hand it came out both
      // larger than the mounting hole and just inside the end margin --
      // so it won on area, the pivot landed at the wrong end, and the
      // hand was drawn boss-first, pointing outward from the dial.
      return isRoundish(hole);
    })
    .sort((a, b) => b.area - a.area)[0];
  let pivot: { x: number; y: number };
  let pivotFromHole = false;
  if (pivotHole) {
    pivot = { x: pivotHole.cx, y: pivotHole.cy };
    pivotFromHole = true;
  } else {
    let massA = 0, massB = 0;
    for (let y = comp.minY; y <= comp.maxY; y++) {
      for (let x = comp.minX; x <= comp.maxX; x++) {
        if (labels[y * w + x] !== comp.label) continue;
        const t = (x - comp.cx) * ax + (y - comp.cy) * ay;
        if (t < 0) massA++;
        else massB++;
      }
    }
    // Step in from the extreme end by a boss radius so the pivot sits on
    // the hand rather than on its very edge.
    const inset = Math.min(thickness, Math.abs(tMax - tMin) * 0.08);
    pivot = massA > massB ? at(tMin + inset) : at(tMax - inset);
  }

  const dA = Math.hypot(endA.x - pivot.x, endA.y - pivot.y);
  const dB = Math.hypot(endB.x - pivot.x, endB.y - pivot.y);
  const tip = dA > dB ? endA : endB;

  // Mass either side of the pivot, measured along the axis, pointing at
  // the tip. Cheap to compute here and the only reliable way to tell that
  // a pivot is wrong: whatever the reason -- a lume cavity mistaken for a
  // mounting hole, two hands touching and merging into one component -- a
  // mid-shaft pivot always shows up as a balanced ratio.
  const tipT = (tip.x - pivot.x) * ax + (tip.y - pivot.y) * ay;
  const towardTip = Math.sign(tipT) || 1;
  let tipMass = 0, tailMass = 0;
  for (let y = comp.minY; y <= comp.maxY; y++) {
    for (let x = comp.minX; x <= comp.maxX; x++) {
      if (labels[y * w + x] !== comp.label) continue;
      const t = ((x - pivot.x) * ax + (y - pivot.y) * ay) * towardTip;
      if (t >= 0) tipMass++;
      else tailMass++;
    }
  }

  return {
    pivotX: pivot.x,
    pivotY: pivot.y,
    tipX: tip.x,
    tipY: tip.y,
    length: Math.max(dA, dB),
    thickness,
    pivotFromHole,
    tailRatio: tipMass > 0 ? tailMass / tipMass : 1,
  };
}

export type HandRole = "hour" | "minute" | "second" | "extra";

/**
 * Assigns hour / minute / second to a set of measured hands.
 *
 * Length alone is not enough: on many sets the seconds hand is the longest
 * *and* the minute hand is longer than the hour hand, but on others the
 * seconds hand is shorter than the minute hand. Thinness is the reliable
 * discriminator -- a seconds hand is a needle, because it carries no lume
 * and drives no load -- so it is identified by aspect first and the
 * remaining hands are ordered by length.
 */
export function assignHandRoles(hands: HandGeometry[]): HandRole[] {
  const roles: HandRole[] = new Array(hands.length).fill("extra");
  if (hands.length === 0) return roles;
  const slenderness = hands.map((g) => (g.thickness > 0 ? g.length / g.thickness : 0));
  const remaining = hands.map((_, i) => i);

  if (hands.length >= 3) {
    let secondIndex = remaining[0]!;
    for (const i of remaining) if (slenderness[i]! > slenderness[secondIndex]!) secondIndex = i;
    roles[secondIndex] = "second";
    remaining.splice(remaining.indexOf(secondIndex), 1);
  }
  remaining.sort((a, b) => hands[b]!.length - hands[a]!.length);
  if (remaining[0] !== undefined) roles[remaining[0]] = "minute";
  if (remaining[1] !== undefined) roles[remaining[1]] = "hour";
  return roles;
}

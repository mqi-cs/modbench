// Perceptual hashing for cross-vendor part matching.
//
// A reimplementation of Python `imagehash.phash` so the numbers here are
// directly comparable with Task 5's (data/fixtures/task5-perceptual-hash-
// check.md): resize to hashSize * 4 square, greyscale, 2-D DCT-II, keep
// the top-left hashSize x hashSize block of low frequencies, threshold
// each coefficient against the block's median. hashSize 16 gives the same
// 256-bit hash Task 5 reported distances out of.
//
// Pure arithmetic over a pixel buffer -- no I/O, no sharp. The caller
// decodes; this hashes. That keeps it testable without fixtures on disk.

export const HASH_SIZE = 16;
export const HIGHFREQ_FACTOR = 4;
/** Side length the image must be decoded to before hashing. */
export const IMAGE_SIDE = HASH_SIZE * HIGHFREQ_FACTOR;

/** Precomputed DCT-II basis, so a run over hundreds of pairs is not N^3 repeatedly. */
function dctMatrix(n: number): Float64Array {
  const m = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      m[k * n + i] = Math.cos(((2 * i + 1) * k * Math.PI) / (2 * n));
    }
  }
  return m;
}

const BASIS = dctMatrix(IMAGE_SIDE);

/**
 * 256-bit perceptual hash of a greyscale IMAGE_SIDE x IMAGE_SIDE buffer.
 *
 * Returned as a bit array rather than a hex string because the only thing
 * ever done with it is a Hamming distance, and packing to hex just to
 * unpack again is noise.
 */
export function phash(grey: Uint8Array | Uint8ClampedArray, side = IMAGE_SIDE): Uint8Array {
  if (grey.length !== side * side) {
    throw new Error(`phash expects ${side}x${side} greyscale pixels, got ${grey.length}`);
  }
  // Rows first, then columns -- a separable 2-D DCT.
  const rows = new Float64Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let k = 0; k < side; k++) {
      let sum = 0;
      for (let x = 0; x < side; x++) sum += grey[y * side + x]! * BASIS[k * side + x]!;
      rows[y * side + k] = sum;
    }
  }
  const low: number[] = [];
  for (let ky = 0; ky < HASH_SIZE; ky++) {
    for (let kx = 0; kx < HASH_SIZE; kx++) {
      let sum = 0;
      for (let y = 0; y < side; y++) sum += rows[y * side + kx]! * BASIS[ky * side + y]!;
      low.push(sum);
    }
  }
  // imagehash thresholds against the median of the whole low-frequency
  // block, DC coefficient included.
  const sorted = [...low].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;

  const bits = new Uint8Array(low.length);
  for (let i = 0; i < low.length; i++) bits[i] = low[i]! > median ? 1 : 0;
  return bits;
}

/** Bits that differ. 0 is identical; HASH_SIZE^2 is maximally unlike. */
export function hamming(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new Error("hash length mismatch");
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export const HASH_BITS = HASH_SIZE * HASH_SIZE;

/** Bit array as hex, for storage. 256 bits -> 64 characters. */
export function bitsToHex(bits: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bits.length; i += 4) {
    out += ((bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!).toString(16);
  }
  return out;
}

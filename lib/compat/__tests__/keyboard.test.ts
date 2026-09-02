// Pass measure 7 (keyboard-only walkthrough) covered as a regression test
// rather than only as a manual walkthrough, since the part card was
// restructured after the walkthrough was first done and manual checks
// don't survive refactors.
import { describe, expect, it } from "vitest";
import { isNavKey, nextIndex } from "../../../components/build/keyboard";

// A 3-column grid of 7 items:
//   0 1 2
//   3 4 5
//   6
const COLS = 3;
const TOTAL = 7;

describe("picker keyboard navigation", () => {
  it("recognises only the keys it handles", () => {
    for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
      expect(isNavKey(k)).toBe(true);
    }
    for (const k of ["Enter", "Escape", "a", "Tab", " "]) {
      expect(isNavKey(k)).toBe(false);
    }
  });

  it("moves down by a full row, not by one item", () => {
    // The bug this replaced: in a 3-wide grid, ArrowDown moved sideways.
    expect(nextIndex("ArrowDown", 0, TOTAL, COLS)).toBe(3);
    expect(nextIndex("ArrowUp", 4, TOTAL, COLS)).toBe(1);
  });

  it("moves left and right by one", () => {
    expect(nextIndex("ArrowRight", 0, TOTAL, COLS)).toBe(1);
    expect(nextIndex("ArrowLeft", 4, TOTAL, COLS)).toBe(3);
  });

  it("enters the grid from outside on any movement key", () => {
    // current === -1 means focus is on the container, e.g. after tabbing
    // in. Every key should land somewhere rather than doing nothing.
    expect(nextIndex("ArrowDown", -1, TOTAL, COLS)).toBe(0);
    expect(nextIndex("ArrowUp", -1, TOTAL, COLS)).toBe(0);
    expect(nextIndex("ArrowRight", -1, TOTAL, COLS)).toBe(0);
    expect(nextIndex("End", -1, TOTAL, COLS)).toBe(TOTAL - 1);
  });

  it("stops at the edges instead of wrapping", () => {
    expect(nextIndex("ArrowLeft", 0, TOTAL, COLS)).toBe(0);
    expect(nextIndex("ArrowRight", TOTAL - 1, TOTAL, COLS)).toBe(TOTAL - 1);
    expect(nextIndex("ArrowUp", 1, TOTAL, COLS)).toBe(1); // top row stays
  });

  it("lands on the last item when moving down out of a partial last row", () => {
    // From index 5, a full row down would be 8, which doesn't exist.
    expect(nextIndex("ArrowDown", 5, TOTAL, COLS)).toBe(TOTAL - 1);
    // Already on the last item: stay.
    expect(nextIndex("ArrowDown", TOTAL - 1, TOTAL, COLS)).toBe(TOTAL - 1);
  });

  it("Home and End jump to the ends", () => {
    expect(nextIndex("Home", 5, TOTAL, COLS)).toBe(0);
    expect(nextIndex("End", 1, TOTAL, COLS)).toBe(TOTAL - 1);
  });

  it("handles a single-column layout and an empty grid without misbehaving", () => {
    expect(nextIndex("ArrowDown", 0, 3, 1)).toBe(1);
    expect(nextIndex("ArrowUp", 2, 3, 1)).toBe(1);
    expect(nextIndex("ArrowDown", 0, 0, 3)).toBeNull();
    // A zero/negative column count must not divide the maths by zero.
    expect(nextIndex("ArrowDown", 0, 5, 0)).toBe(1);
  });
});

// Keyboard navigation maths for the part picker, kept pure so it can be
// tested without a DOM. The component does the DOM part (find the
// buttons, measure the column count, move focus); everything about WHICH
// item to move to lives here.
//
// The picker is a responsive grid, not a list. The first version moved by
// one item for ArrowUp/ArrowDown, which in a 3-column grid means the
// selection jumps sideways when you press Down -- correct for a list,
// wrong for what's on screen. Left/Right move by one; Up/Down move by a
// full row.

export type NavKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

export function isNavKey(key: string): key is NavKey {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End";
}

/**
 * @param current index of the focused item, or -1 when focus is on the
 *   container rather than an item (tabbing in, for instance)
 * @returns the index to focus, or null if there is nowhere to go
 */
export function nextIndex(key: NavKey, current: number, total: number, columns: number): number | null {
  if (total <= 0) return null;
  const cols = Math.max(1, columns);

  // Entering the grid from outside: any movement key lands on the first
  // item rather than doing nothing, so the grid is reachable by keyboard
  // without having to click one first.
  if (current < 0) return key === "End" ? total - 1 : 0;

  switch (key) {
    case "Home":
      return 0;
    case "End":
      return total - 1;
    case "ArrowLeft":
      return Math.max(current - 1, 0);
    case "ArrowRight":
      return Math.min(current + 1, total - 1);
    case "ArrowUp": {
      const up = current - cols;
      // Already in the top row: stay put rather than wrapping, so holding
      // the key doesn't cycle unexpectedly.
      return up >= 0 ? up : current;
    }
    case "ArrowDown": {
      const down = current + cols;
      if (down < total) return down;
      // Last row is usually partial. Landing on the final item is more
      // useful than refusing to move.
      return current === total - 1 ? current : total - 1;
    }
  }
}

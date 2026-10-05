/** A 2D skin is data only (PLAN.md 5.5): CSS for the board and pieces, plus a piece sprite. */
export interface Skin2D {
  /** CSS custom properties and rules scoped to .board, .pc, .dw-pc, .ghost. */
  css: string;
  /** An <svg> with symbols #pc-k, #pc-q, #pc-r, #pc-b, #pc-n, #pc-p. */
  sprite: string;
}

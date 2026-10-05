export type Color = 'w' | 'b';
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

/** Square index 0..63. a1 = 0, h1 = 7, a8 = 56, h8 = 63. */
export type Square = number;

/** Stable piece identity. Never reused, so renderers can track a piece across changes. */
export type PieceId = number;

export interface Piece {
  readonly id: PieceId;
  readonly type: PieceType;
  readonly color: Color;
}

/** What changed on the board. Undo, redo, and reset produce the same shape. */
export interface BoardDiff {
  readonly moved: readonly { readonly id: PieceId; readonly from: Square; readonly to: Square }[];
  readonly added: readonly { readonly id: PieceId; readonly to: Square }[];
  readonly removed: readonly { readonly id: PieceId; readonly from: Square }[];
}

export interface ChangeEvent {
  readonly diff: BoardDiff;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

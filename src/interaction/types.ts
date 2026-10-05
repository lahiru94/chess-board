import type { Color, PieceId, PieceType, Square } from '../core/index.ts';

export type Orientation = 'white' | 'black';

/** Where a piece being placed comes from: the board, or the drawer (a new piece). */
export type Source =
  | { readonly kind: 'board'; readonly id: PieceId }
  | { readonly kind: 'drawer'; readonly type: PieceType; readonly color: Color };

export interface InteractionState {
  /** Click-click selection. */
  readonly selected: Source | null;
  readonly dragging: Source | null;
  /** Square under the dragged piece. */
  readonly hover: Square | null;
  /** Keyboard focus square; null when the keyboard is not in use. */
  readonly focus: Square | null;
  /** From is null when the piece came from the drawer. */
  readonly lastMove: { readonly from: Square | null; readonly to: Square } | null;
  readonly orientation: Orientation;
}

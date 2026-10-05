import type { Board, Square } from './core/index.ts';
import type { Controller } from './interaction/index.ts';

/** The contract every renderer implements (PLAN.md 5.4). */
export interface BoardView {
  /** Adopts existing markup in `el` if present, otherwise renders it. */
  mount(el: HTMLElement, board: Board, controller: Controller): void;
  unmount(): void;
  /** Square under a viewport point, or null if outside the board. Used for drawer drops. */
  squareAt(clientX: number, clientY: number): Square | null;
}

import { fileOf, isSquare, rankOf, toSquare, type Board, type Color, type PieceType, type Square } from '../core/index.ts';
import type { InteractionState, Orientation, Source } from './types.ts';

type Listener = (state: InteractionState) => void;

/**
 * Turns user intent into core commands and holds view state (selection, drag,
 * hover, focus, orientation). Shared by every view and the drawer. No DOM here.
 */
export class Controller {
  #board: Board;
  #state: InteractionState = {
    selected: null,
    dragging: null,
    hover: null,
    focus: null,
    lastMove: null,
    orientation: 'white',
  };
  #listeners = new Set<Listener>();

  constructor(board: Board) {
    this.#board = board;
  }

  get state(): InteractionState {
    return this.#state;
  }

  subscribe(fn: Listener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // ---- Drag ----

  pickUp(source: Source): void {
    if (source.kind === 'board' && this.#board.squareOf(source.id) == null) return;
    this.#set({ dragging: source, hover: null });
  }

  hover(sq: Square | null): void {
    if (sq !== this.#state.hover) this.#set({ hover: sq });
  }

  /** Ends a drag. `null` means outside the board: a board piece is removed, a drawer piece is dropped back. */
  drop(sq: Square | null): void {
    const source = this.#state.dragging;
    if (!source) return;
    this.#set({ dragging: null, hover: null, selected: null });
    if (sq != null) this.#place(source, sq);
    else if (source.kind === 'board') this.#remove(source.id);
  }

  cancel(): void {
    this.#set({ dragging: null, hover: null, selected: null });
  }

  // ---- Click / tap ----

  /**
   * Click-click moves. With nothing selected, a tap selects the piece on the square.
   * With a selection, a tap on the same square or another piece of the same color
   * changes the selection; any other square receives the selected piece.
   */
  tap(sq: Square): void {
    const sel = this.#state.selected;
    const target = this.#board.pieceAt(sq);
    if (!sel) {
      if (target) this.#set({ selected: { kind: 'board', id: target.id } });
      return;
    }
    if (sel.kind === 'board') {
      if (target?.id === sel.id) return this.#set({ selected: null });
      const selColor = this.#board.piece(sel.id)?.color;
      if (target && target.color === selColor) return this.#set({ selected: { kind: 'board', id: target.id } });
    }
    this.#set({ selected: null });
    this.#place(sel, sq);
  }

  /** Selects a drawer piece for click-click placement. Tapping it again deselects. */
  tapDrawer(type: PieceType, color: Color): void {
    const sel = this.#state.selected;
    const same = sel?.kind === 'drawer' && sel.type === type && sel.color === color;
    this.#set({ selected: same ? null : { kind: 'drawer', type, color } });
  }

  // ---- Keyboard ----

  /** Moves the keyboard focus in screen directions (dx right, dy up), respecting orientation. */
  moveFocus(dx: number, dy: number): void {
    const flip = this.#state.orientation === 'black' ? -1 : 1;
    const cur = this.#state.focus ?? (flip === 1 ? toSquare(4, 1) : toSquare(4, 6));
    const file = Math.min(7, Math.max(0, fileOf(cur) + dx * flip));
    const rank = Math.min(7, Math.max(0, rankOf(cur) + dy * flip));
    this.#set({ focus: this.#state.focus == null ? cur : toSquare(file, rank) });
  }

  activateFocus(): void {
    if (this.#state.focus != null) this.tap(this.#state.focus);
  }

  blurFocus(): void {
    if (this.#state.focus != null) this.#set({ focus: null });
  }

  /** Removes the selected board piece (keyboard Delete). */
  removeSelected(): void {
    const sel = this.#state.selected;
    if (sel?.kind !== 'board') return;
    this.#set({ selected: null });
    this.#remove(sel.id);
  }

  // ---- Global ----

  flip(): void {
    this.#set({ orientation: this.#state.orientation === 'white' ? 'black' : 'white' });
  }

  setOrientation(orientation: Orientation): void {
    if (orientation !== this.#state.orientation) this.#set({ orientation });
  }

  undo(): void {
    if (this.#board.undo()) this.#set({ selected: null, lastMove: null });
  }

  redo(): void {
    if (this.#board.redo()) this.#set({ selected: null, lastMove: null });
  }

  reset(): void {
    if (this.#board.reset()) this.#set({ selected: null, lastMove: null });
  }

  // ---- Internals ----

  #place(source: Source, sq: Square): void {
    if (!isSquare(sq)) return;
    if (source.kind === 'board') {
      const from = this.#board.squareOf(source.id);
      if (from != null && this.#board.move(source.id, sq)) this.#set({ lastMove: { from, to: sq } });
    } else if (this.#board.add(source.type, source.color, sq) != null) {
      this.#set({ lastMove: { from: null, to: sq } });
    }
  }

  #remove(id: number): void {
    if (this.#board.remove(id)) this.#set({ lastMove: null });
  }

  #set(patch: Partial<InteractionState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const fn of this.#listeners) fn(this.#state);
  }
}

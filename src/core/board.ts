import { diffSquares } from './diff';
import { START_POSITION } from './setup';
import { isSquare } from './square';
import type { ChangeEvent, Color, Piece, PieceId, PieceType, Square } from './types';

type Cells = (PieceId | null)[];

/** Each entry holds exactly what is needed to apply it again or reverse it. */
type Command =
  | { kind: 'move'; id: PieceId; from: Square; to: Square; captured: PieceId | null }
  | { kind: 'add'; id: PieceId; to: Square; captured: PieceId | null }
  | { kind: 'remove'; id: PieceId; from: Square }
  | { kind: 'reset'; before: Cells };

type Listener = (event: ChangeEvent) => void;

const HISTORY_LIMIT = 1000;

/**
 * The board state. Commands are the only way to change it.
 * There are no chess rules: one piece per square is the only constraint.
 */
export class Board {
  #cells: Cells = new Array<PieceId | null>(64).fill(null);
  #squareOf = new Map<PieceId, Square>();
  // Holds every piece ever created, including off-board ones, so undo can bring them back.
  #pieces = new Map<PieceId, Piece>();
  #startCells: Cells;
  #nextId: PieceId = 1;
  #undo: Command[] = [];
  #redo: Command[] = [];
  #listeners = new Set<Listener>();

  constructor() {
    for (const { square, type, color } of START_POSITION) {
      const id = this.#createPiece(type, color);
      this.#cells[square] = id;
      this.#squareOf.set(id, square);
    }
    this.#startCells = this.#cells.slice();
  }

  // ---- Queries ----

  pieceAt(sq: Square): Piece | null {
    const id = this.#cells[sq];
    return id == null ? null : this.#lookup(id);
  }

  /** Returns the piece record even when the piece is off the board (renderers need it to animate removals). */
  piece(id: PieceId): Piece | undefined {
    return this.#pieces.get(id);
  }

  squareOf(id: PieceId): Square | null {
    return this.#squareOf.get(id) ?? null;
  }

  /** All pieces on the board with their squares. */
  onBoard(): { piece: Piece; square: Square }[] {
    const out: { piece: Piece; square: Square }[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const id = this.#cells[sq];
      if (id != null) out.push({ piece: this.#lookup(id), square: sq });
    }
    return out;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  subscribe(fn: Listener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // ---- Commands ----

  /** Moves a piece. A piece on the target square is captured. Returns false if nothing changed. */
  move(id: PieceId, to: Square): boolean {
    const from = this.#squareOf.get(id);
    if (from === undefined || !isSquare(to) || from === to) return false;
    return this.#do({ kind: 'move', id, from, to, captured: this.#cells[to] as PieceId | null });
  }

  /** Puts a new piece on the board (from the drawer). Returns its ID, or null if the square is invalid. */
  add(type: PieceType, color: Color, to: Square): PieceId | null {
    if (!isSquare(to)) return null;
    const id = this.#createPiece(type, color);
    this.#do({ kind: 'add', id, to, captured: this.#cells[to] as PieceId | null });
    return id;
  }

  /** Takes a piece off the board. Returns false if it is not on the board. */
  remove(id: PieceId): boolean {
    const from = this.#squareOf.get(id);
    if (from === undefined) return false;
    return this.#do({ kind: 'remove', id, from });
  }

  /** Restores the start position. Returns false if the board is already in it. */
  reset(): boolean {
    if (this.#cells.every((id, sq) => id === this.#startCells[sq])) return false;
    return this.#do({ kind: 'reset', before: this.#cells.slice() });
  }

  undo(): boolean {
    const cmd = this.#undo.pop();
    if (!cmd) return false;
    this.#redo.push(cmd);
    this.#change(() => this.#revert(cmd));
    return true;
  }

  redo(): boolean {
    const cmd = this.#redo.pop();
    if (!cmd) return false;
    this.#undo.push(cmd);
    this.#change(() => this.#apply(cmd));
    return true;
  }

  // ---- Internals ----

  /** For IDs read from cells: every ID in a cell was created by #createPiece, so the record exists. */
  #lookup(id: PieceId): Piece {
    return this.#pieces.get(id) as Piece;
  }

  #createPiece(type: PieceType, color: Color): PieceId {
    const id = this.#nextId++;
    this.#pieces.set(id, { id, type, color });
    return id;
  }

  #do(cmd: Command): boolean {
    this.#undo.push(cmd);
    if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
    this.#redo.length = 0;
    this.#change(() => this.#apply(cmd));
    return true;
  }

  #apply(cmd: Command): void {
    const c = this.#cells;
    switch (cmd.kind) {
      case 'move':
        c[cmd.from] = null;
        c[cmd.to] = cmd.id;
        break;
      case 'add':
        c[cmd.to] = cmd.id;
        break;
      case 'remove':
        c[cmd.from] = null;
        break;
      case 'reset':
        this.#cells = this.#startCells.slice();
        break;
    }
  }

  #revert(cmd: Command): void {
    const c = this.#cells;
    switch (cmd.kind) {
      case 'move':
        c[cmd.to] = cmd.captured;
        c[cmd.from] = cmd.id;
        break;
      case 'add':
        c[cmd.to] = cmd.captured;
        break;
      case 'remove':
        c[cmd.from] = cmd.id;
        break;
      case 'reset':
        this.#cells = cmd.before.slice();
        break;
    }
  }

  /** Runs a mutation, then updates the square index and notifies listeners with the diff. */
  #change(mutate: () => void): void {
    const before = this.#cells.slice();
    mutate();
    const diff = diffSquares(before, this.#cells);
    for (const { id } of diff.removed) this.#squareOf.delete(id);
    for (const { id, to } of diff.moved) this.#squareOf.set(id, to);
    for (const { id, to } of diff.added) this.#squareOf.set(id, to);
    // Every command changes at least one cell (no-ops are rejected before they reach history).
    const event: ChangeEvent = { diff, canUndo: this.canUndo, canRedo: this.canRedo };
    for (const fn of this.#listeners) fn(event);
  }
}

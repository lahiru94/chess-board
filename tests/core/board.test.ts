import { beforeEach, describe, expect, it } from 'vitest';
import { Board, type ChangeEvent, type PieceId, type Square } from '../../src/core';
import { diffSquares } from '../../src/core/diff';

const sq = (name: string): Square => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);

/** Board as 8 FEN-like rows, rank 8 first. Uppercase = white. */
function ascii(board: Board): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    for (let file = 0; file < 8; file++) {
      const p = board.pieceAt(rank * 8 + file);
      row += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.';
    }
    rows.push(row);
  }
  return rows.join('/');
}

const START = 'rnbqkbnr/pppppppp/......../......../......../......../PPPPPPPP/RNBQKBNR';

function idAt(board: Board, name: string): PieceId {
  const p = board.pieceAt(sq(name));
  if (!p) throw new Error(`no piece on ${name}`);
  return p.id;
}

let board: Board;
let events: ChangeEvent[];

beforeEach(() => {
  board = new Board();
  events = [];
  board.subscribe((e) => events.push(e));
});

describe('start position', () => {
  it('loads the standard opening position', () => {
    expect(ascii(board)).toBe(START);
    expect(board.onBoard()).toHaveLength(32);
  });

  it('gives the 32 start pieces stable IDs 1..32', () => {
    expect(idAt(board, 'a1')).toBe(1);
    expect(idAt(board, 'h8')).toBe(32);
    expect(new Board().pieceAt(sq('e1'))).toEqual(board.pieceAt(sq('e1')));
  });

  it('starts with empty history', () => {
    expect(board.canUndo).toBe(false);
    expect(board.canRedo).toBe(false);
  });
});

describe('queries', () => {
  it('finds pieces by square and by ID', () => {
    const king = board.pieceAt(sq('e1'))!;
    expect(king).toMatchObject({ type: 'k', color: 'w' });
    expect(board.squareOf(king.id)).toBe(sq('e1'));
    expect(board.piece(king.id)).toBe(king);
    expect(board.pieceAt(sq('e4'))).toBeNull();
  });

  it('returns null / undefined for unknown pieces', () => {
    expect(board.squareOf(999)).toBeNull();
    expect(board.piece(999)).toBeUndefined();
  });
});

describe('move', () => {
  it('moves a piece to an empty square anywhere, ignoring chess rules', () => {
    const rook = idAt(board, 'a1');
    expect(board.move(rook, sq('e5'))).toBe(true);
    expect(board.pieceAt(sq('a1'))).toBeNull();
    expect(board.pieceAt(sq('e5'))?.id).toBe(rook);
    expect(board.squareOf(rook)).toBe(sq('e5'));
    expect(events).toEqual([
      { diff: { moved: [{ id: rook, from: sq('a1'), to: sq('e5') }], added: [], removed: [] }, canUndo: true, canRedo: false },
    ]);
  });

  it('captures the piece on an occupied target square', () => {
    const knight = idAt(board, 'g1');
    const pawn = idAt(board, 'g7');
    expect(board.move(knight, sq('g7'))).toBe(true);
    expect(board.pieceAt(sq('g7'))?.id).toBe(knight);
    expect(board.squareOf(pawn)).toBeNull();
    expect(board.piece(pawn)).toMatchObject({ type: 'p', color: 'b' });
    expect(board.onBoard()).toHaveLength(31);
    expect(events[0]!.diff.removed).toEqual([{ id: pawn, from: sq('g7') }]);
  });

  it('allows capturing a piece of the same color', () => {
    expect(board.move(idAt(board, 'd1'), sq('e1'))).toBe(true);
    expect(board.pieceAt(sq('e1'))?.type).toBe('q');
  });

  it('rejects no-op and invalid moves without touching history', () => {
    const rook = idAt(board, 'a1');
    expect(board.move(rook, sq('a1'))).toBe(false);
    expect(board.move(rook, 64)).toBe(false);
    expect(board.move(rook, -1)).toBe(false);
    expect(board.move(rook, 2.5)).toBe(false);
    expect(board.move(999, sq('e4'))).toBe(false);
    expect(board.canUndo).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('rejects moving a piece that is off the board', () => {
    const pawn = idAt(board, 'e7');
    board.move(idAt(board, 'e2'), sq('e7'));
    expect(board.move(pawn, sq('e4'))).toBe(false);
  });
});

describe('add', () => {
  it('adds a new piece with a fresh ID', () => {
    const id = board.add('q', 'w', sq('e4'));
    expect(id).toBe(33);
    expect(board.pieceAt(sq('e4'))).toMatchObject({ id: 33, type: 'q', color: 'w' });
    expect(events[0]!.diff).toEqual({ moved: [], added: [{ id: 33, to: sq('e4') }], removed: [] });
  });

  it('captures the piece on an occupied square', () => {
    const pawn = idAt(board, 'e2');
    const id = board.add('n', 'b', sq('e2'))!;
    expect(board.pieceAt(sq('e2'))?.id).toBe(id);
    expect(board.squareOf(pawn)).toBeNull();
    expect(events[0]!.diff.removed).toEqual([{ id: pawn, from: sq('e2') }]);
  });

  it('rejects an invalid square', () => {
    expect(board.add('q', 'w', 64)).toBeNull();
    expect(board.canUndo).toBe(false);
  });

  it('never reuses IDs, even after undo', () => {
    const a = board.add('q', 'w', sq('e4'))!;
    board.undo();
    const b = board.add('q', 'w', sq('e4'))!;
    expect(b).not.toBe(a);
  });
});

describe('remove', () => {
  it('takes a piece off the board', () => {
    const pawn = idAt(board, 'a2');
    expect(board.remove(pawn)).toBe(true);
    expect(board.pieceAt(sq('a2'))).toBeNull();
    expect(board.squareOf(pawn)).toBeNull();
    expect(events[0]!.diff).toEqual({ moved: [], added: [], removed: [{ id: pawn, from: sq('a2') }] });
  });

  it('rejects a piece that is not on the board', () => {
    const pawn = idAt(board, 'a2');
    board.remove(pawn);
    expect(board.remove(pawn)).toBe(false);
    expect(board.remove(999)).toBe(false);
  });

  it('supports promotion as remove + add', () => {
    const pawn = idAt(board, 'b2');
    board.move(pawn, sq('b8'));
    board.remove(pawn);
    board.add('q', 'w', sq('b8'));
    expect(board.pieceAt(sq('b8'))).toMatchObject({ type: 'q', color: 'w' });
    board.undo();
    board.undo();
    expect(board.pieceAt(sq('b8'))?.id).toBe(pawn);
  });
});

describe('reset', () => {
  it('restores the start position with the original IDs', () => {
    const rook = idAt(board, 'a1');
    board.move(rook, sq('a5'));
    board.remove(idAt(board, 'e2'));
    board.add('q', 'b', sq('d4'));
    expect(board.reset()).toBe(true);
    expect(ascii(board)).toBe(START);
    expect(idAt(board, 'a1')).toBe(rook);
  });

  it('reports a diff that covers moved, added, and removed pieces', () => {
    const rook = idAt(board, 'a1');
    const pawn = idAt(board, 'e2');
    board.move(rook, sq('a5'));
    board.remove(pawn);
    const queen = board.add('q', 'b', sq('d4'))!;
    events.length = 0;
    board.reset();
    expect(events[0]!.diff).toEqual({
      moved: [{ id: rook, from: sq('a5'), to: sq('a1') }],
      added: [{ id: pawn, to: sq('e2') }],
      removed: [{ id: queen, from: sq('d4') }],
    });
  });

  it('does nothing when already at the start position', () => {
    expect(board.reset()).toBe(false);
    expect(board.canUndo).toBe(false);
  });

  it('can be undone', () => {
    board.move(idAt(board, 'e2'), sq('e4'));
    const before = ascii(board);
    board.reset();
    board.undo();
    expect(ascii(board)).toBe(before);
  });
});

describe('undo / redo', () => {
  it('reverses a move and replays it', () => {
    const pawn = idAt(board, 'e2');
    board.move(pawn, sq('e4'));
    expect(board.undo()).toBe(true);
    expect(ascii(board)).toBe(START);
    expect(board.canUndo).toBe(false);
    expect(board.canRedo).toBe(true);
    expect(board.redo()).toBe(true);
    expect(board.squareOf(pawn)).toBe(sq('e4'));
    expect(board.canRedo).toBe(false);
  });

  it('brings a captured piece back on undo, with the same ID', () => {
    const bishop = idAt(board, 'c1');
    const pawn = idAt(board, 'h7');
    board.move(bishop, sq('h7'));
    events.length = 0;
    board.undo();
    expect(board.pieceAt(sq('h7'))?.id).toBe(pawn);
    expect(board.pieceAt(sq('c1'))?.id).toBe(bishop);
    expect(events[0]).toEqual({
      diff: { moved: [{ id: bishop, from: sq('h7'), to: sq('c1') }], added: [{ id: pawn, to: sq('h7') }], removed: [] },
      canUndo: false,
      canRedo: true,
    });
  });

  it('reverses add and remove, including the captured piece of an add', () => {
    const pawn = idAt(board, 'd2');
    const queen = board.add('q', 'b', sq('d2'))!;
    board.undo();
    expect(board.pieceAt(sq('d2'))?.id).toBe(pawn);
    expect(board.squareOf(queen)).toBeNull();
    board.redo();
    expect(board.pieceAt(sq('d2'))?.id).toBe(queen);
    board.remove(queen);
    board.undo();
    expect(board.pieceAt(sq('d2'))?.id).toBe(queen);
    board.redo();
    expect(board.pieceAt(sq('d2'))).toBeNull();
  });

  it('replays reset on redo', () => {
    board.move(idAt(board, 'e2'), sq('e4'));
    board.reset();
    board.undo();
    board.redo();
    expect(ascii(board)).toBe(START);
  });

  it('clears redo history on a new command', () => {
    board.move(idAt(board, 'e2'), sq('e4'));
    board.undo();
    board.move(idAt(board, 'd2'), sq('d4'));
    expect(board.canRedo).toBe(false);
    expect(board.redo()).toBe(false);
  });

  it('returns false when there is nothing to undo or redo', () => {
    expect(board.undo()).toBe(false);
    expect(board.redo()).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('round-trips a long mixed sequence', () => {
    const snapshots = [ascii(board)];
    const steps = [
      () => board.move(idAt(board, 'e2'), sq('e4')),
      () => board.move(idAt(board, 'd8'), sq('e4')),
      () => board.add('r', 'w', sq('h5')),
      () => board.remove(idAt(board, 'a8')),
      () => board.reset(),
      () => board.move(idAt(board, 'g1'), sq('f3')),
    ];
    for (const step of steps) {
      step();
      snapshots.push(ascii(board));
    }
    for (let i = snapshots.length - 2; i >= 0; i--) {
      board.undo();
      expect(ascii(board)).toBe(snapshots[i]);
    }
    for (let i = 1; i < snapshots.length; i++) {
      board.redo();
      expect(ascii(board)).toBe(snapshots[i]);
    }
  });

  it('keeps at most 1000 history entries', () => {
    const rook = idAt(board, 'a1');
    for (let i = 0; i < 1001; i++) board.move(rook, i % 2 ? sq('a1') : sq('a4'));
    let undos = 0;
    while (board.undo()) undos++;
    expect(undos).toBe(1000);
  });
});

describe('events', () => {
  it('stops notifying after unsubscribe', () => {
    const seen: ChangeEvent[] = [];
    const off = board.subscribe((e) => seen.push(e));
    board.move(idAt(board, 'e2'), sq('e4'));
    off();
    board.move(idAt(board, 'd2'), sq('d4'));
    expect(seen).toHaveLength(1);
  });
});

describe('diffSquares', () => {
  it('returns an empty diff for identical boards', () => {
    const cells = new Array<number | null>(64).fill(null);
    cells[0] = 1;
    expect(diffSquares(cells, cells.slice())).toEqual({ moved: [], added: [], removed: [] });
  });
});

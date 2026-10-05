import { beforeEach, describe, expect, it } from 'vitest';
import { Board, type Square } from '../../src/core/index.ts';
import { Controller } from '../../src/interaction/index.ts';

const sq = (name: string): Square => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);

let board: Board;
let ctl: Controller;

beforeEach(() => {
  board = new Board();
  ctl = new Controller(board);
});

const idAt = (name: string) => board.pieceAt(sq(name))!.id;

describe('drag', () => {
  it('moves a dragged board piece and records the last move', () => {
    const pawn = idAt('e2');
    ctl.pickUp({ kind: 'board', id: pawn });
    expect(ctl.state.dragging).toEqual({ kind: 'board', id: pawn });
    ctl.hover(sq('e4'));
    expect(ctl.state.hover).toBe(sq('e4'));
    ctl.drop(sq('e4'));
    expect(board.squareOf(pawn)).toBe(sq('e4'));
    expect(ctl.state).toMatchObject({ dragging: null, hover: null, lastMove: { from: sq('e2'), to: sq('e4') } });
  });

  it('removes a board piece dropped outside the board', () => {
    const pawn = idAt('a2');
    ctl.pickUp({ kind: 'board', id: pawn });
    ctl.drop(null);
    expect(board.squareOf(pawn)).toBeNull();
  });

  it('adds a drawer piece on drop, and ignores a drawer drop outside the board', () => {
    ctl.pickUp({ kind: 'drawer', type: 'q', color: 'w' });
    ctl.drop(null);
    expect(board.onBoard()).toHaveLength(32);
    ctl.pickUp({ kind: 'drawer', type: 'q', color: 'w' });
    ctl.drop(sq('d5'));
    expect(board.pieceAt(sq('d5'))).toMatchObject({ type: 'q', color: 'w' });
    expect(ctl.state.lastMove).toEqual({ from: null, to: sq('d5') });
  });

  it('does nothing on drop without a drag, or on a same-square drop', () => {
    ctl.drop(sq('e4'));
    expect(board.canUndo).toBe(false);
    ctl.pickUp({ kind: 'board', id: idAt('e2') });
    ctl.drop(sq('e2'));
    expect(board.canUndo).toBe(false);
  });

  it('ignores pick-up of an off-board piece, and cancel clears the drag', () => {
    const pawn = idAt('a2');
    board.remove(pawn);
    ctl.pickUp({ kind: 'board', id: pawn });
    expect(ctl.state.dragging).toBeNull();
    ctl.pickUp({ kind: 'board', id: idAt('b2') });
    ctl.cancel();
    expect(ctl.state.dragging).toBeNull();
  });
});

describe('tap (click-click)', () => {
  it('selects, then moves to an empty square', () => {
    const knight = idAt('g1');
    ctl.tap(sq('g1'));
    expect(ctl.state.selected).toEqual({ kind: 'board', id: knight });
    ctl.tap(sq('f3'));
    expect(board.squareOf(knight)).toBe(sq('f3'));
    expect(ctl.state.selected).toBeNull();
  });

  it('does nothing when tapping an empty square with no selection', () => {
    ctl.tap(sq('e4'));
    expect(ctl.state.selected).toBeNull();
  });

  it('deselects on a second tap of the same piece', () => {
    ctl.tap(sq('g1'));
    ctl.tap(sq('g1'));
    expect(ctl.state.selected).toBeNull();
  });

  it('switches selection to another piece of the same color', () => {
    ctl.tap(sq('g1'));
    ctl.tap(sq('b1'));
    expect(ctl.state.selected).toEqual({ kind: 'board', id: idAt('b1') });
    expect(board.canUndo).toBe(false);
  });

  it('captures a piece of the other color', () => {
    const queen = idAt('d1');
    ctl.tap(sq('d1'));
    ctl.tap(sq('d7'));
    expect(board.pieceAt(sq('d7'))?.id).toBe(queen);
  });

  it('places a selected drawer piece, and toggles drawer selection', () => {
    ctl.tapDrawer('n', 'b');
    expect(ctl.state.selected).toEqual({ kind: 'drawer', type: 'n', color: 'b' });
    ctl.tapDrawer('n', 'b');
    expect(ctl.state.selected).toBeNull();
    ctl.tapDrawer('n', 'b');
    ctl.tap(sq('e5'));
    expect(board.pieceAt(sq('e5'))).toMatchObject({ type: 'n', color: 'b' });
  });
});

describe('keyboard', () => {
  it('shows focus on the first key, then moves in screen directions', () => {
    ctl.moveFocus(1, 0);
    expect(ctl.state.focus).toBe(sq('e2'));
    ctl.moveFocus(1, 0);
    expect(ctl.state.focus).toBe(sq('f2'));
    ctl.moveFocus(0, 1);
    expect(ctl.state.focus).toBe(sq('f3'));
  });

  it('reverses directions when the board is flipped, and clamps at the edge', () => {
    ctl.flip();
    ctl.moveFocus(0, 0);
    expect(ctl.state.focus).toBe(sq('e7'));
    ctl.moveFocus(1, 0);
    expect(ctl.state.focus).toBe(sq('d7'));
    for (let i = 0; i < 10; i++) ctl.moveFocus(0, -1);
    expect(ctl.state.focus).toBe(sq('d8'));
  });

  it('activates and removes via focus and selection', () => {
    ctl.activateFocus(); // no focus: no-op
    ctl.moveFocus(0, 0);
    ctl.activateFocus();
    expect(ctl.state.selected).toEqual({ kind: 'board', id: idAt('e2') });
    ctl.removeSelected();
    expect(board.pieceAt(sq('e2'))).toBeNull();
    ctl.removeSelected(); // nothing selected: no-op
    ctl.blurFocus();
    expect(ctl.state.focus).toBeNull();
  });
});

describe('global actions', () => {
  it('flips and sets orientation', () => {
    ctl.flip();
    expect(ctl.state.orientation).toBe('black');
    ctl.setOrientation('white');
    expect(ctl.state.orientation).toBe('white');
  });

  it('undo, redo, and reset clear the selection and last move', () => {
    ctl.tap(sq('e2'));
    ctl.tap(sq('e4'));
    ctl.tap(sq('d2'));
    ctl.undo();
    expect(ctl.state).toMatchObject({ selected: null, lastMove: null });
    expect(board.pieceAt(sq('e2'))).not.toBeNull();
    ctl.redo();
    expect(board.pieceAt(sq('e4'))).not.toBeNull();
    ctl.reset();
    expect(board.pieceAt(sq('e4'))).toBeNull();
  });

  it('notifies subscribers until unsubscribed', () => {
    let n = 0;
    const off = ctl.subscribe(() => n++);
    ctl.flip();
    off();
    ctl.flip();
    expect(n).toBe(1);
  });
});

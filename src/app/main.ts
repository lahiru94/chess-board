import { Board, squareName, type BoardDiff } from '../core/index.ts';
import { Controller } from '../interaction/index.ts';
import { View2D } from '../view2d/view2d.ts';
import type { BoardView } from '../view-contract.ts';
import { mountDrawer } from './drawer.ts';
import { pieceName } from './markup.ts';

function $<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

const board = new Board();
const ctl = new Controller(board);
const boardEl = $('#board');
const view: BoardView = new View2D();
view.mount(boardEl, board, ctl);

// ---- Toolbar ----

const undoBtn = $<HTMLButtonElement>('#undo');
const redoBtn = $<HTMLButtonElement>('#redo');
const drawerBtn = $<HTMLButtonElement>('#drawer-toggle');
const drawerEl = $('#drawer');

undoBtn.addEventListener('click', () => ctl.undo());
redoBtn.addEventListener('click', () => ctl.redo());
$('#flip').addEventListener('click', () => ctl.flip());
$('#reset').addEventListener('click', () => ctl.reset());
drawerBtn.addEventListener('click', () => {
  const open = drawerBtn.getAttribute('aria-expanded') !== 'true';
  drawerBtn.setAttribute('aria-expanded', String(open));
  drawerEl.dataset.open = String(open);
});

board.subscribe((e) => {
  undoBtn.disabled = !e.canUndo;
  redoBtn.disabled = !e.canRedo;
});

mountDrawer(drawerEl, ctl, () => view, boardEl);

// ---- Shortcuts ----

addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) ctl.undo();
  else if ((key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey)) ctl.redo();
  else return;
  e.preventDefault();
});

// ---- Screen reader announcements ----

const live = $('#live');
board.subscribe(({ diff }) => (live.textContent = describe(diff)));

function describe(d: BoardDiff): string {
  const name = (id: number) => {
    const p = board.piece(id);
    return p ? pieceName(p.type, p.color) : 'Piece';
  };
  const parts = [
    ...d.moved.map((m) => `${name(m.id)} ${squareName(m.from)} to ${squareName(m.to)}`),
    ...d.added.map((a) => `${name(a.id)} placed on ${squareName(a.to)}`),
    ...d.removed.map((r) => `${name(r.id)} removed from ${squareName(r.from)}`),
  ];
  return parts.length > 4 ? 'Board changed' : parts.join('. ');
}

boardEl.closest('.app')?.setAttribute('data-ready', 'true');

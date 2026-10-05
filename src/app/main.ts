import { Board, squareName, type BoardDiff } from '../core/index.ts';
import { Controller } from '../interaction/index.ts';
import { View2D } from '../view2d/view2d.ts';
import type { BoardView } from '../view-contract.ts';
import { mountDrawer } from './drawer.ts';
import { pieceName } from './markup.ts';
import { mountSkinPicker } from './skins.ts';
import { prefetch3dOnIntent, ViewSwitcher } from './views.ts';

function $<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

const board = new Board();
const ctl = new Controller(board);
const boardEl = $('#board');
const view2d: BoardView = new View2D();
view2d.mount(boardEl, board, ctl);

// ---- 2D / 3D and skins ----

const viewBtn = $<HTMLButtonElement>('#view-toggle');
let refreshSkins: (is3d: boolean) => void = () => {};
const views = new ViewSwitcher(board, ctl, boardEl, $('#board3d'), view2d, (is3d) => {
  const label = is3d ? 'Switch to 2D view' : 'Switch to 3D view';
  viewBtn.textContent = is3d ? '2D' : '3D';
  viewBtn.title = label;
  viewBtn.setAttribute('aria-label', label);
  viewBtn.setAttribute('aria-pressed', String(is3d));
  refreshSkins(is3d);
});
refreshSkins = mountSkinPicker($<HTMLSelectElement>('#skin-picker'), views);

viewBtn.addEventListener('click', async () => {
  if (views.is3d) return views.show2d();
  viewBtn.disabled = true;
  try {
    await views.show3d();
  } finally {
    viewBtn.disabled = false;
  }
});

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

mountDrawer(drawerEl, ctl, () => views.active, boardEl);

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

// ---- After first paint ----

prefetch3dOnIntent(viewBtn);

addEventListener('load', () => {
  // Offline support and instant repeat visits (PLAN.md 6.1). Not in dev: it would cache dev files.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});

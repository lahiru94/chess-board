import type { Board, BoardDiff, PieceId, Square } from '../core/index.ts';
import type { Controller, InteractionState, Orientation } from '../interaction/index.ts';
import type { BoardView } from '../view-contract.ts';
import { handleBoardKey } from '../view-keys.ts';
import { boardMarkup, cellTransform, coordsMarkup, pieceMarkup, type HighlightName } from './markup.ts';

const DRAG_THRESHOLD = 4; // px before a press becomes a drag
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function find(root: HTMLElement, sel: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Board markup is missing ${sel}`);
  return el;
}

interface Press {
  pointerId: number;
  square: Square;
  id: PieceId | null;
  startX: number;
  startY: number;
  dragging: boolean;
}

/** DOM renderer. Pieces are absolutely positioned and moved only with transforms (PLAN.md 6.2). */
export class View2D implements BoardView {
  #el!: HTMLElement;
  #board!: Board;
  #ctl!: Controller;
  #pieces = new Map<PieceId, HTMLElement>();
  #hl = {} as Record<HighlightName, HTMLElement>;
  #coords!: HTMLElement;
  #orientation: Orientation = 'white';
  #rect: DOMRect | null = null;
  #press: Press | null = null;
  #pointer = { x: 0, y: 0 };
  #raf = 0;
  #pointerFocus = false;
  #cleanup: (() => void)[] = [];

  mount(el: HTMLElement, board: Board, ctl: Controller): void {
    this.#el = el;
    this.#board = board;
    this.#ctl = ctl;
    this.#orientation = ctl.state.orientation;

    // Adopt the pre-rendered markup when it is there; render it otherwise.
    if (!el.querySelector('.coords')) el.innerHTML = boardMarkup(board.onBoard(), this.#orientation);
    for (const p of el.querySelectorAll<HTMLElement>('.pc')) this.#pieces.set(Number(p.dataset.id), p);
    for (const h of ['from', 'to', 'sel', 'hover', 'focus'] as const) this.#hl[h] = find(el, `.hl-${h}`);
    this.#coords = find(el, '.coords');

    const ro = new ResizeObserver(() => (this.#rect = null));
    ro.observe(el);
    const onScroll = () => (this.#rect = null);
    addEventListener('scroll', onScroll, { passive: true, capture: true });

    this.#on(el, 'pointerdown', this.#onDown);
    this.#on(el, 'pointermove', this.#onMove);
    this.#on(el, 'pointerup', this.#onUp);
    this.#on(el, 'pointercancel', this.#onCancel);
    this.#on(el, 'keydown', (e) => handleBoardKey(e, ctl));
    // Show the focus square only for keyboard focus, not when a press focuses the board.
    this.#on(el, 'focus', () => !this.#pointerFocus && ctl.moveFocus(0, 0));
    this.#on(el, 'blur', () => ctl.blurFocus());
    this.#on(el, 'contextmenu', (e) => e.preventDefault());

    this.#cleanup.push(
      () => ro.disconnect(),
      () => removeEventListener('scroll', onScroll, { capture: true }),
      board.subscribe((e) => this.#applyDiff(e.diff)),
      ctl.subscribe((s) => this.#render(s)),
    );
    this.#render(ctl.state);
  }

  unmount(): void {
    cancelAnimationFrame(this.#raf);
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    this.#pieces.clear();
    this.#el.innerHTML = '';
  }

  squareAt(clientX: number, clientY: number): Square | null {
    const r = (this.#rect ??= this.#el.getBoundingClientRect());
    const col = Math.floor(((clientX - r.left) / r.width) * 8);
    const row = Math.floor(((clientY - r.top) / r.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return this.#orientation === 'white' ? (7 - row) * 8 + col : row * 8 + (7 - col);
  }

  // ---- Board changes ----

  #applyDiff(diff: BoardDiff): void {
    const o = this.#orientation;
    for (const { id, to } of diff.moved) {
      const el = this.#pieces.get(id);
      if (el) el.style.transform = cellTransform(to, o);
    }
    for (const { id } of diff.removed) {
      const el = this.#pieces.get(id);
      if (!el) continue;
      this.#pieces.delete(id);
      this.#animateOut(el);
    }
    for (const { id, to } of diff.added) {
      const piece = this.#board.piece(id);
      if (!piece) continue;
      const tpl = document.createElement('template');
      tpl.innerHTML = pieceMarkup(piece, to, o);
      const el = tpl.content.firstElementChild as HTMLElement;
      this.#el.append(el);
      this.#pieces.set(id, el);
      this.#animateIn(el);
    }
  }

  /** Captured and removed pieces slide toward the drawer and fade (PLAN.md 2.1). */
  #animateOut(el: HTMLElement): void {
    el.classList.add('out');
    if (reducedMotion.matches) return el.remove();
    const from = el.style.transform;
    const away = matchMedia('(min-aspect-ratio: 5/4)').matches ? 'translate(60%,0)' : 'translate(0,60%)';
    el.animate(
      [
        { transform: from, opacity: 1 },
        { transform: `${from} ${away} scale(.5)`, opacity: 0 },
      ],
      { duration: 250, easing: 'ease-in' },
    ).onfinish = () => el.remove();
  }

  #animateIn(el: HTMLElement): void {
    if (reducedMotion.matches) return;
    const to = el.style.transform;
    el.animate(
      [
        { transform: `${to} scale(.5)`, opacity: 0 },
        { transform: to, opacity: 1 },
      ],
      { duration: 200, easing: 'ease-out' },
    );
  }

  // ---- View state ----

  #render(s: InteractionState): void {
    if (s.orientation !== this.#orientation) {
      this.#orientation = s.orientation;
      this.#rect = null;
      for (const [id, el] of this.#pieces) {
        const sq = this.#board.squareOf(id);
        if (sq != null) el.style.transform = cellTransform(sq, s.orientation);
      }
      this.#coords.innerHTML = coordsMarkup(s.orientation);
    }
    const sel = s.selected?.kind === 'board' ? this.#board.squareOf(s.selected.id) : null;
    this.#showHl('from', s.lastMove?.from ?? null);
    this.#showHl('to', s.lastMove?.to ?? null);
    this.#showHl('sel', sel);
    this.#showHl('hover', s.dragging ? s.hover : null);
    this.#showHl('focus', s.focus);
    this.#el.classList.toggle('placing', s.selected?.kind === 'drawer');
  }

  #showHl(name: HighlightName, sq: Square | null): void {
    const el = this.#hl[name];
    el.hidden = sq == null;
    if (sq != null) el.style.transform = cellTransform(sq, this.#orientation);
  }

  // ---- Pointer input ----

  #onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.#press) return;
    this.#rect = this.#el.getBoundingClientRect();
    const square = this.squareAt(e.clientX, e.clientY);
    if (square == null) return;
    e.preventDefault();
    this.#pointerFocus = true;
    this.#el.focus({ preventScroll: true });
    this.#pointerFocus = false;
    this.#el.setPointerCapture(e.pointerId);
    const id = this.#board.pieceAt(square)?.id ?? null;
    this.#press = { pointerId: e.pointerId, square, id, startX: e.clientX, startY: e.clientY, dragging: false };
  };

  #onMove = (e: PointerEvent): void => {
    const p = this.#press;
    if (!p || p.pointerId !== e.pointerId || p.id == null) return;
    this.#pointer = { x: e.clientX, y: e.clientY };
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD) return;
      p.dragging = true;
      this.#ctl.pickUp({ kind: 'board', id: p.id });
      this.#pieces.get(p.id)?.classList.add('drag');
    }
    this.#raf ||= requestAnimationFrame(this.#frame);
  };

  /** One transform write per frame while dragging; no layout reads. */
  #frame = (): void => {
    this.#raf = 0;
    const p = this.#press;
    const r = this.#rect;
    if (!p?.dragging || p.id == null || !r) return;
    const el = this.#pieces.get(p.id);
    const half = r.width / 16;
    if (el) el.style.transform = `translate(${this.#pointer.x - r.left - half}px,${this.#pointer.y - r.top - half}px)`;
    this.#ctl.hover(this.squareAt(this.#pointer.x, this.#pointer.y));
  };

  #onUp = (e: PointerEvent): void => {
    const p = this.#press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.#press = null;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    if (!p.dragging) return this.#ctl.tap(p.square);
    const el = p.id == null ? undefined : this.#pieces.get(p.id);
    el?.classList.remove('drag');
    this.#ctl.drop(this.squareAt(e.clientX, e.clientY));
    this.#snapBack(p.id);
  };

  #onCancel = (e: PointerEvent): void => {
    const p = this.#press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.#press = null;
    this.#pieces.get(p.id ?? -1)?.classList.remove('drag');
    this.#ctl.cancel();
    this.#snapBack(p.id);
  };

  /** After a drop that changed nothing (same square), return the piece to its cell. */
  #snapBack(id: PieceId | null): void {
    if (id == null) return;
    const sq = this.#board.squareOf(id);
    const el = this.#pieces.get(id);
    if (el && sq != null) el.style.transform = cellTransform(sq, this.#orientation);
  }

  #on<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void): void {
    el.addEventListener(type, fn);
    this.#cleanup.push(() => el.removeEventListener(type, fn));
  }
}

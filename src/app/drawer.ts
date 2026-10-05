import type { Color, PieceType } from '../core/index.ts';
import type { Controller } from '../interaction/index.ts';
import type { BoardView } from '../view-contract.ts';

const DRAG_THRESHOLD = 4;

/**
 * The piece drawer (PLAN.md 2.2). It sits outside the views: drops are resolved
 * through `view.squareAt`, so the same drawer works for 2D and 3D.
 */
export function mountDrawer(el: HTMLElement, ctl: Controller, getView: () => BoardView, boardEl: HTMLElement): void {
  let press: { id: number; type: PieceType; color: Color; x: number; y: number; ghost: HTMLElement | null } | null = null;
  let raf = 0;
  let pointer = { x: 0, y: 0 };

  const moveGhost = () => {
    raf = 0;
    if (!press?.ghost) return;
    const half = press.ghost.offsetWidth / 2;
    press.ghost.style.transform = `translate(${pointer.x - half}px,${pointer.y - half}px)`;
    ctl.hover(getView().squareAt(pointer.x, pointer.y));
  };

  el.addEventListener('pointerdown', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('.dw-pc');
    if (!btn || e.button !== 0 || press) return;
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, type: btn.dataset.type as PieceType, color: btn.dataset.color as Color, x: e.clientX, y: e.clientY, ghost: null };
  });

  el.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId) return;
    pointer = { x: e.clientX, y: e.clientY };
    if (!press.ghost) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
      const ghost = document.createElement('div');
      ghost.className = `ghost ${press.color}`;
      ghost.style.width = ghost.style.height = `${boardEl.offsetWidth / 8}px`;
      ghost.innerHTML = `<svg viewBox="0 0 45 45" aria-hidden="true"><use href="#pc-${press.type}"/></svg>`;
      document.body.append(ghost);
      press.ghost = ghost;
      ctl.pickUp({ kind: 'drawer', type: press.type, color: press.color });
    }
    raf ||= requestAnimationFrame(moveGhost);
  });

  const end = (e: PointerEvent, commit: boolean) => {
    if (!press || press.id !== e.pointerId) return;
    const p = press;
    press = null;
    cancelAnimationFrame(raf);
    raf = 0;
    if (!p.ghost) {
      if (commit) ctl.tapDrawer(p.type, p.color);
      return;
    }
    p.ghost.remove();
    if (commit) ctl.drop(getView().squareAt(e.clientX, e.clientY));
    else ctl.cancel();
  };
  el.addEventListener('pointerup', (e) => end(e, true));
  el.addEventListener('pointercancel', (e) => end(e, false));

  // Keyboard and screen readers: a click without a pointer press selects the piece.
  el.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const btn = (e.target as Element).closest<HTMLElement>('.dw-pc');
    if (btn) ctl.tapDrawer(btn.dataset.type as PieceType, btn.dataset.color as Color);
  });

  const buttons = [...el.querySelectorAll<HTMLElement>('.dw-pc')];
  ctl.subscribe((s) => {
    const sel = s.selected?.kind === 'drawer' ? s.selected : null;
    for (const b of buttons) {
      const on = !!sel && b.dataset.type === sel.type && b.dataset.color === sel.color;
      b.setAttribute('aria-pressed', String(on));
    }
  });
}

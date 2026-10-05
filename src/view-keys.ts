import type { Controller } from './interaction/index.ts';

const DIRS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/** Board keyboard handling shared by every view (PLAN.md 2.4). */
export function handleBoardKey(e: KeyboardEvent, ctl: Controller): void {
  const d = DIRS[e.key];
  if (d) ctl.moveFocus(d[0], d[1]);
  else if (e.key === 'Enter' || e.key === ' ') ctl.activateFocus();
  else if (e.key === 'Escape') ctl.cancel();
  else if (e.key === 'Delete' || e.key === 'Backspace') ctl.removeSelected();
  else return;
  e.preventDefault();
}

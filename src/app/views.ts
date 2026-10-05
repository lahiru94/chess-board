import type { Board } from '../core/index.ts';
import type { Controller } from '../interaction/index.ts';
import { SKINS_3D } from '../skins/registry.ts';
import type { Skin3D } from '../skins/3d/types.ts';
import type { View3D } from '../view3d/view3d.ts';
import type { BoardView } from '../view-contract.ts';

const LOST_GRACE_MS = 1500;

let loading: Promise<{ View3D: typeof View3D; skin: Skin3D }> | null = null;

/** The 3D view code (with three.js) and its default skin, fetched once, in parallel. */
function load3d() {
  const skin = SKINS_3D[0];
  if (!skin) throw new Error('No 3D skin registered');
  return (loading ??= Promise.all([import('../view3d/view3d.ts'), skin.load()]).then(([m, s]) => ({ View3D: m.View3D, skin: s })));
}

/**
 * Fetches the 3D chunk when the user shows intent: the first interaction with the page,
 * or pointing at / focusing the 3D button. The first load stays lean, and the first
 * switch is usually instant (PLAN.md 6.1). Skipped on Save-Data or a 2G connection.
 */
export function prefetch3dOnIntent(button: HTMLElement): void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return;
  const go = () => {
    off();
    void load3d().catch(() => (loading = null));
  };
  const targets: [EventTarget, string][] = [
    [button, 'pointerenter'],
    [button, 'focus'],
    [document, 'pointerdown'],
    [document, 'keydown'],
  ];
  const off = () => targets.forEach(([t, type]) => t.removeEventListener(type, go, true));
  targets.forEach(([t, type]) => t.addEventListener(type, go, { capture: true, passive: true }));
}

/**
 * Owns the 2D and 3D views and switches between them. The 3D view stays mounted
 * (hidden) after first use so the next switch is instant (PLAN.md 6.4).
 */
export class ViewSwitcher {
  #board: Board;
  #ctl: Controller;
  #el2d: HTMLElement;
  #el3d: HTMLElement;
  #view2d: BoardView;
  #view3d: View3D | null = null;
  #is3d = false;
  #onChange: (is3d: boolean) => void;

  constructor(board: Board, ctl: Controller, el2d: HTMLElement, el3d: HTMLElement, view2d: BoardView, onChange: (is3d: boolean) => void) {
    this.#board = board;
    this.#ctl = ctl;
    this.#el2d = el2d;
    this.#el3d = el3d;
    this.#view2d = view2d;
    this.#onChange = onChange;
  }

  get active(): BoardView {
    return this.#is3d && this.#view3d ? this.#view3d : this.#view2d;
  }

  get is3d(): boolean {
    return this.#is3d;
  }

  get view3d(): View3D | null {
    return this.#view3d;
  }

  async show3d(): Promise<void> {
    this.#el3d.classList.add('busy');
    try {
      const { View3D, skin } = await load3d();
      // A context the browser dropped and never gave back: start fresh.
      if (this.#view3d?.lost) this.#drop3d();
      this.#el3d.hidden = false;
      if (!this.#view3d) {
        const v = new View3D(skin, () => this.#onLost(v));
        v.mount(this.#el3d, this.#board, this.#ctl);
        this.#view3d = v;
      }
    } finally {
      this.#el3d.classList.remove('busy');
    }
    this.#set(true);
  }

  show2d(): void {
    this.#set(false);
  }

  #set(is3d: boolean): void {
    this.#is3d = is3d;
    this.#el2d.hidden = is3d;
    this.#el3d.hidden = !is3d;
    this.#onChange(is3d);
  }

  #drop3d(): void {
    this.#view3d?.unmount();
    this.#view3d = null;
  }

  /** If the context does not come back soon, rebuild the scene (or on the next switch, if hidden). */
  #onLost(v: View3D): void {
    setTimeout(() => {
      if (this.#view3d !== v || !v.lost) return;
      this.#drop3d();
      if (this.#is3d) void this.show3d();
    }, LOST_GRACE_MS);
  }
}

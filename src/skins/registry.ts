import type { Skin2D } from './2d/types.ts';
import type { Skin3D } from './3d/types.ts';

/**
 * Every skin the app knows. Each one loads as its own small chunk, only when needed.
 * To add a skin: add a folder under skins/2d or skins/3d and one entry here (PLAN.md 5.5).
 */
export interface SkinEntry<T> {
  id: string;
  name: string;
  load: () => Promise<T>;
}

export const SKINS_2D: readonly SkinEntry<Skin2D | null>[] = [
  // Classic is inlined into index.html at build time for the first paint, so there is nothing to load.
  { id: 'classic', name: 'Classic', load: async () => null },
];

export const SKINS_3D: readonly SkinEntry<Skin3D>[] = [
  { id: 'wood', name: 'Wood & Ivory', load: () => import('./3d/wood/skin.ts').then((m) => m.woodSkin) },
];

import { SKINS_2D, SKINS_3D } from '../skins/registry.ts';
import type { Skin2D } from '../skins/2d/types.ts';
import type { ViewSwitcher } from './views.ts';

/**
 * Skin picker (PLAN.md 5.5). It shows only when the active view has more than one skin.
 * 2D skins swap the page's skin <style> and piece sprite; 3D skins go to the 3D view.
 */
export function mountSkinPicker(select: HTMLSelectElement, views: ViewSwitcher): (is3d: boolean) => void {
  const styleEl = document.getElementById('skin-2d');
  const spriteEl = document.getElementById('sprite');
  // The inlined Classic skin, kept so the user can switch back to it.
  const builtin: Skin2D = { css: styleEl?.textContent ?? '', sprite: spriteEl?.innerHTML ?? '' };
  const current = { '2d': SKINS_2D[0]?.id, '3d': SKINS_3D[0]?.id };

  const apply2d = (skin: Skin2D) => {
    if (styleEl) styleEl.textContent = skin.css;
    if (spriteEl) spriteEl.innerHTML = skin.sprite;
  };

  select.addEventListener('change', async () => {
    const id = select.value;
    if (views.is3d) {
      const entry = SKINS_3D.find((s) => s.id === id);
      if (!entry) return;
      current['3d'] = id;
      views.view3d?.setSkin(await entry.load());
    } else {
      const entry = SKINS_2D.find((s) => s.id === id);
      if (!entry) return;
      current['2d'] = id;
      apply2d((await entry.load()) ?? builtin);
    }
  });

  const refresh = (is3d: boolean) => {
    const list = is3d ? SKINS_3D : SKINS_2D;
    select.hidden = list.length < 2;
    select.replaceChildren(...list.map((s) => new Option(s.name, s.id)));
    select.value = (is3d ? current['3d'] : current['2d']) ?? '';
  };
  refresh(false);
  return refresh;
}

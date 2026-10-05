import { expect, test, type Page } from '@playwright/test';
import { fitDistance } from '../../src/view3d/camera-fit.ts';

// Mirrors the 3D view's default camera (src/view3d/view3d.ts) to find squares on screen.
const CAMERA = { polar: 0.72, fov: 35 };

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Screen point of a square at a given height, for white (theta 0) or black (theta pi) camera. */
async function project(page: Page, square: string, height: number, black = false) {
  const box = (await page.locator('#board3d').boundingBox())!;
  const theta = black ? Math.PI : 0;
  const phi = CAMERA.polar;
  const r = fitDistance(phi, box.width / box.height, CAMERA.fov);
  const cam: V = [r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta)];
  const f = norm(sub([0, 0, 0], cam));
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const file = square.charCodeAt(0) - 97;
  const rank = square.charCodeAt(1) - 49;
  const d = sub([file - 3.5, height, 3.5 - rank], cam);
  const t = Math.tan(((CAMERA.fov / 2) * Math.PI) / 180);
  const aspect = box.width / box.height;
  const nx = dot(d, right) / (dot(d, f) * t * aspect);
  const ny = dot(d, up) / (dot(d, f) * t);
  return { x: box.x + ((nx + 1) / 2) * box.width, y: box.y + ((1 - ny) / 2) * box.height };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y - 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/** Piece on a square, read from the 2D board's DOM (both views share one board state). */
async function piece2d(page: Page, square: string) {
  return page.evaluate((sq) => {
    const flipped = document.querySelector('#board .co-f')?.textContent === 'h';
    let col = sq.charCodeAt(0) - 97;
    let row = 7 - (sq.charCodeAt(1) - 49);
    if (flipped) [col, row] = [7 - col, 7 - row];
    const want = `translate(${col * 100}%, ${row * 100}%)`;
    for (const el of document.querySelectorAll<HTMLElement>('#board .pc:not(.out)')) {
      if (el.style.transform.replace(/,\s*/, ', ') === want) {
        const type = el.querySelector('use')!.getAttribute('href')!.slice(4);
        return (el.classList.contains('w') ? 'w' : 'b') + type;
      }
    }
    return null;
  }, square);
}

/** Waits until the 3D view is shown and two frames have run: layout, resize observers, and camera fit have settled. */
async function ready3d(page: Page) {
  await expect(page.locator('#board3d canvas')).toBeVisible();
  await expect(page.locator('#board3d')).not.toHaveClass(/busy/);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
});

test('3D code is not part of the first load, and the view switch works both ways', async ({ page }) => {
  await page.locator('#view-toggle').click();
  await ready3d(page);
  await expect(page.locator('#board')).toBeHidden();
  await expect(page.locator('#view-toggle')).toHaveText('2D');

  await page.locator('#view-toggle').click();
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#board3d')).toBeHidden();
  await expect(page.locator('#view-toggle')).toHaveText('3D');
});

test('drag a piece in 3D; the 2D board shows the same position', async ({ page }) => {
  await page.locator('#view-toggle').click();
  await ready3d(page);
  await drag(page, await project(page, 'e2', 0.6), await project(page, 'e4', 0));
  await expect(page.locator('#undo')).toBeEnabled();
  await page.locator('#view-toggle').click();
  expect(await piece2d(page, 'e4')).toBe('wp');
  expect(await piece2d(page, 'e2')).toBeNull();
});

test('a press on a tall piece picks that piece, not the square behind', async ({ page }) => {
  await page.locator('#view-toggle').click();
  await ready3d(page);
  // The top of the d1 queen is drawn over d2/d3 from this camera.
  await drag(page, await project(page, 'd1', 1.15), await project(page, 'd4', 0));
  await page.locator('#view-toggle').click();
  expect(await piece2d(page, 'd4')).toBe('wq');
  expect(await piece2d(page, 'd2')).toBe('wp');
});

test('drawer drops land on the 3D board', async ({ page }) => {
  await page.locator('#view-toggle').click();
  await page.locator('#drawer-toggle').click();
  await ready3d(page);
  const knight = (await page.locator('.dw-pc[data-type="n"][data-color="b"]').boundingBox())!;
  await drag(page, { x: knight.x + knight.width / 2, y: knight.y + knight.height / 2 }, await project(page, 'd5', 0));
  await page.locator('#view-toggle').click();
  expect(await piece2d(page, 'd5')).toBe('bn');
});

test('rotate turns the camera to black, and moves still land correctly', async ({ page }) => {
  await page.locator('#view-toggle').click();
  await page.locator('#flip').click();
  await ready3d(page);
  await expect(page.locator('#board3d')).toHaveAttribute('data-camera', 'black');
  await drag(page, await project(page, 'e7', 0.6, true), await project(page, 'e5', 0, true));
  await page.locator('#view-toggle').click();
  expect(await piece2d(page, 'e5')).toBe('bp');
});

test('keyboard works in 3D', async ({ page }) => {
  await page.locator('#view-toggle').click();
  await ready3d(page);
  await page.locator('#board3d').focus();
  await page.keyboard.press('Enter'); // focus starts on e2
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.locator('#view-toggle').click();
  expect(await piece2d(page, 'e3')).toBe('wp');
});

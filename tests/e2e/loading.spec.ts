import { expect, test } from '@playwright/test';

test('first load fetches only the HTML and one script; 3D is prefetched on intent', async ({ page }) => {
  const beforeLoad: string[] = [];
  const all: string[] = [];
  let loaded = false;
  page.on('load', () => (loaded = true));
  page.on('request', (r) => {
    all.push(r.url());
    if (!loaded) beforeLoad.push(r.url());
  });
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');

  const local = beforeLoad.filter((u) => u.startsWith('http://localhost'));
  expect(local.filter((u) => !u.endsWith('/')).every((u) => /\/assets\/index-.*\.js$/.test(u))).toBe(true);
  expect(local.some((u) => u.includes('view3d'))).toBe(false);

  await page.waitForLoadState('networkidle');
  expect(all.some((u) => u.includes('view3d'))).toBe(false);

  await page.locator('#view-toggle').hover();
  await expect.poll(() => all.some((u) => u.includes('view3d')), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => all.some((u) => u.includes('skin3d')), { timeout: 10_000 }).toBe(true);
});

test('3D view rebuilds itself when the browser drops the WebGL context', async ({ page }) => {
  await page.goto('/');
  await page.locator('#view-toggle').click();
  const canvas = page.locator('#board3d canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((c: HTMLCanvasElement) => c.setAttribute('data-first', 'yes'));

  // Simulate the GPU process dropping the context and never giving it back.
  await canvas.evaluate((c: HTMLCanvasElement) => {
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.locator('#board3d canvas[data-first]')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('#board3d canvas')).toHaveCount(1);

  // The rebuilt view still works: keyboard move, checked through the 2D board.
  await page.locator('#board3d').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('#undo')).toBeEnabled();
});

test('works offline after the first visit (service worker)', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#board .pc')).toHaveCount(32);
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
  await context.setOffline(false);
});

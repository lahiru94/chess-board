import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
});

test('2D board has no WCAG A/AA violations', async ({ page }) => {
  expect(await scan(page)).toEqual([]);
});

test('open drawer and a selection have no violations', async ({ page }) => {
  await page.locator('#drawer-toggle').click();
  await page.locator('.dw-pc[data-type="q"][data-color="w"]').click();
  expect(await scan(page)).toEqual([]);
});

test('dark mode has no violations', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await scan(page)).toEqual([]);
});

test('3D view has no violations', async ({ page }) => {
  await page.locator('#view-toggle').click();
  await expect(page.locator('#board3d canvas')).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

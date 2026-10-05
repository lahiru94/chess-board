import { expect, test } from '@playwright/test';

test('app loads and the entry script runs', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Chess Board');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
});

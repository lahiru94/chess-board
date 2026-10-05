import { expect, test, type Page } from '@playwright/test';

/** Center of a square in viewport coordinates, for the current orientation. */
async function center(page: Page, square: string) {
  const box = (await page.locator('#board').boundingBox())!;
  const flipped = (await page.locator('#board .co-f').first().textContent()) === 'h';
  let col = square.charCodeAt(0) - 97;
  let row = 7 - (square.charCodeAt(1) - 49);
  if (flipped) [col, row] = [7 - col, 7 - row];
  const cell = box.width / 8;
  return { x: box.x + (col + 0.5) * cell, y: box.y + (row + 0.5) * cell };
}

/** Piece on a square as "wp", "bk", ... or null; read from the DOM the view renders. */
async function pieceAt(page: Page, square: string) {
  const { x, y } = await center(page, square);
  return page.evaluate(
    ({ px, py }) => {
      for (const el of document.querySelectorAll<HTMLElement>('#board .pc:not(.out)')) {
        const r = el.getBoundingClientRect();
        if (px >= r.left && px < r.right && py >= r.top && py < r.bottom) {
          const type = el.querySelector('use')!.getAttribute('href')!.slice(4);
          return (el.classList.contains('w') ? 'w' : 'b') + type;
        }
      }
      return null;
    },
    { px: x, py: y },
  );
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

const clickSquare = async (page: Page, s: string) => {
  const { x, y } = await center(page, s);
  await page.mouse.click(x, y);
};

const dragSquares = async (page: Page, a: string, b: string) => drag(page, await center(page, a), await center(page, b));

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
});

test('shows the start position from pre-rendered HTML', async ({ page }) => {
  await expect(page.locator('#board .pc')).toHaveCount(32);
  expect(await pieceAt(page, 'e1')).toBe('wk');
  expect(await pieceAt(page, 'd8')).toBe('bq');
  expect(await pieceAt(page, 'e4')).toBeNull();
});

test('drag moves a piece anywhere, and capture removes the target', async ({ page }) => {
  await dragSquares(page, 'g1', 'e5');
  expect(await pieceAt(page, 'e5')).toBe('wn');
  expect(await pieceAt(page, 'g1')).toBeNull();

  await dragSquares(page, 'e5', 'd7');
  expect(await pieceAt(page, 'd7')).toBe('wn');
  await expect(page.locator('#board .pc')).toHaveCount(31);
});

test('click-click moves a piece', async ({ page }) => {
  await clickSquare(page, 'b1');
  await expect(page.locator('#board .hl-sel')).toBeVisible();
  await clickSquare(page, 'c3');
  expect(await pieceAt(page, 'c3')).toBe('wn');
});

test('undo and redo via buttons and keyboard', async ({ page }) => {
  await expect(page.locator('#undo')).toBeDisabled();
  await dragSquares(page, 'e2', 'e4');
  await page.locator('#undo').click();
  expect(await pieceAt(page, 'e2')).toBe('wp');
  await page.locator('#redo').click();
  expect(await pieceAt(page, 'e4')).toBe('wp');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await pieceAt(page, 'e2')).toBe('wp');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await pieceAt(page, 'e4')).toBe('wp');
});

test('undo brings a captured piece back', async ({ page }) => {
  await dragSquares(page, 'd1', 'd7');
  await page.locator('#undo').click();
  expect(await pieceAt(page, 'd7')).toBe('bp');
  expect(await pieceAt(page, 'd1')).toBe('wq');
});

test('dropping a piece outside the board removes it', async ({ page }) => {
  const box = (await page.locator('#board').boundingBox())!;
  await drag(page, await center(page, 'a2'), { x: box.x - 20, y: box.y + box.height / 2 });
  await expect(page.locator('#board .pc')).toHaveCount(31);
  expect(await pieceAt(page, 'a2')).toBeNull();
});

test('rotate puts black at the bottom and keeps moves working', async ({ page }) => {
  await page.locator('#flip').click();
  await expect(page.locator('#board .co-f').first()).toHaveText('h');
  const e8 = await center(page, 'e8');
  const box = (await page.locator('#board').boundingBox())!;
  expect(e8.y).toBeGreaterThan(box.y + box.height * 0.85);
  await dragSquares(page, 'e7', 'e5');
  expect(await pieceAt(page, 'e5')).toBe('bp');
});

test('reset restores the start position', async ({ page }) => {
  await dragSquares(page, 'e2', 'e4');
  await page.locator('#reset').click();
  expect(await pieceAt(page, 'e2')).toBe('wp');
  expect(await pieceAt(page, 'e4')).toBeNull();
});

test('drawer: drag a new piece onto the board (promotion)', async ({ page }) => {
  await page.locator('#drawer-toggle').click();
  await expect(page.locator('#drawer')).toHaveAttribute('data-open', 'true');
  const box = (await page.locator('#board').boundingBox())!;
  await drag(page, await center(page, 'a7'), { x: box.x - 20, y: box.y });
  const queen = (await page.locator('.dw-pc[data-type="q"][data-color="w"]').boundingBox())!;
  await drag(page, { x: queen.x + queen.width / 2, y: queen.y + queen.height / 2 }, await center(page, 'a7'));
  expect(await pieceAt(page, 'a7')).toBe('wq');
});

test('drawer: click a piece, then click a square', async ({ page }) => {
  await page.locator('#drawer-toggle').click();
  await page.locator('.dw-pc[data-type="n"][data-color="b"]').click();
  await expect(page.locator('.dw-pc[data-type="n"][data-color="b"]')).toHaveAttribute('aria-pressed', 'true');
  await clickSquare(page, 'e4');
  expect(await pieceAt(page, 'e4')).toBe('bn');
});

test('keyboard: arrows, Enter to pick up and drop, Delete to remove', async ({ page }) => {
  await page.locator('#board').focus();
  await expect(page.locator('#board .hl-focus')).toBeVisible(); // keyboard focus starts on e2
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  expect(await pieceAt(page, 'e4')).toBe('wp');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Delete');
  expect(await pieceAt(page, 'e4')).toBeNull();
  await expect(page.locator('#live')).toContainText('White pawn removed from e4');
});

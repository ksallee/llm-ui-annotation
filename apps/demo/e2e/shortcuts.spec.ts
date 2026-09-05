import { expect, test } from './fixtures.js';
import { centre, exitMode, field, overlay, popup, ready, setMode } from './overlay.js';

test('while a mode is active the capture layer swallows host clicks', async ({ page, site }) => {
  await page.goto(`${site}/app/`);
  await ready(page);

  await page.keyboard.press('e');
  await expect.poll(() => field<string | null>(page, 'mode')).toBe('element');

  const at = await centre(page, '[data-testid="invite"]');
  await page.mouse.click(at.x, at.y);
  await expect(popup(page)).toBeVisible();
  await expect(page.locator('[data-testid="modal"]')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(popup(page)).toBeHidden();

  await page.keyboard.down('Meta');
  await expect.poll(() => field<boolean>(page, 'passthrough')).toBe(true);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Meta');
  await expect(page.locator('[data-testid="modal"]')).toBeVisible();
});

test('the mode, panel, pause and help shortcuts do what the sheet says', async ({ page, site }) => {
  await page.goto(`${site}/app/`);
  await ready(page);

  for (const [key, mode] of [
    ['e', 'element'],
    ['h', 'text'],
    ['d', 'page'],
  ] as const) {
    await page.keyboard.press(key);
    await expect.poll(() => field<string | null>(page, 'mode')).toBe(mode);
  }
  await exitMode(page);

  await page.keyboard.press('i');
  await expect(overlay(page).locator('[aria-label="Annotations"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay(page).locator('[aria-label="Annotations"]')).toBeHidden();

  await page.keyboard.press('Shift+P');
  await expect.poll(() => field<boolean>(page, 'frozen')).toBe(true);
  const paused = await page
    .locator('[data-testid="spinner"]')
    .evaluate((el) => getComputedStyle(el).animationPlayState);
  expect(paused).toBe('paused');
  await page.keyboard.press('Shift+P');
  await expect.poll(() => field<boolean>(page, 'frozen')).toBe(false);

  await page.keyboard.press('?');
  await expect(overlay(page).getByText('Element mode', { exact: true })).toBeVisible();
});

test('shortcuts are ignored while the user types in the host page', async ({ page, site }) => {
  await page.goto(`${site}/app/`);
  await ready(page);

  await page.locator('input[name="team"]').fill('');
  await page.locator('input[name="team"]').type('page edit');
  expect(await page.locator('input[name="team"]').inputValue()).toBe('page edit');
  expect(await field<string | null>(page, 'mode')).toBeNull();
});

test('⌘↵ sends the batch from anywhere', async ({ page, site }) => {
  await page.goto(`${site}/app/`);
  await setMode(page, 'Element');
  const at = await centre(page, '[data-testid="save"]');
  await page.mouse.click(at.x, at.y);
  await popup(page).locator('textarea.field').fill('rename this');
  await page.keyboard.press('Meta+Enter');
  await expect(popup(page)).toBeHidden();
  await expect.poll(() => field<unknown[]>(page, 'drafts').then((d) => d.length)).toBe(1);

  await page.keyboard.press('Meta+Enter');
  await expect(overlay(page).locator('[aria-label="Send annotations"]')).toBeVisible();
});

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import { centre, exitMode, field, overlay, popup, ready, setMode } from './overlay.js';

/** Record what the host page itself receives, so we can prove the overlay let it through. */
async function watchHostKeys(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __keys: string[] }).__keys = seen;
    document.addEventListener('keydown', (e) => seen.push(e.key));
  });
  return () => page.evaluate(() => (window as unknown as { __keys: string[] }).__keys);
}

test('while a mode is active the capture layer swallows host clicks', async ({ page, site }) => {
  await page.goto(`${site}/app/`);
  await setMode(page, 'Element');

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

test('no overlay key but ⌥A fires while idle; the scoped ones fire in a mode', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/app/`);
  await ready(page);
  const hostKeys = await watchHostKeys(page);

  for (const key of ['e', 'h', 'd', 'i', 'p']) await page.keyboard.press(key);
  expect(await hostKeys()).toEqual(['e', 'h', 'd', 'i', 'p']);
  expect(await field<string | null>(page, 'mode')).toBeNull();
  expect(await field<boolean>(page, 'prefs.panelOpen')).toBe(false);

  await page.keyboard.press('Alt+a');
  await expect.poll(() => field<boolean>(page, 'paletteOpen')).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => field<boolean>(page, 'paletteOpen')).toBe(false);

  await setMode(page, 'Element');
  for (const [key, mode] of [
    ['h', 'text'],
    ['e', 'element'],
  ] as const) {
    await page.keyboard.press(key);
    await expect.poll(() => field<string | null>(page, 'mode')).toBe(mode);
  }

  // The panel is `I` and the toolbar, never Escape: Escape belongs to the mode.
  await page.keyboard.press('i');
  await expect(overlay(page).locator('[aria-label="Annotations"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay(page).locator('[aria-label="Annotations"]')).toBeVisible();
  await expect.poll(() => field<string | null>(page, 'mode')).toBeNull();
  await page.keyboard.press('i');
  await expect(overlay(page).locator('[aria-label="Annotations"]')).toBeHidden();
  await page.keyboard.press('d');

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
  await page.keyboard.press('Escape');
  await exitMode(page);
});

test('shortcuts are ignored while the user types in the host page', async ({ page, site }) => {
  await page.goto(`${site}/app/`);
  await setMode(page, 'Element');

  await page.locator('input[name="team"]').fill('');
  await page.locator('input[name="team"]').type('page edit');
  expect(await page.locator('input[name="team"]').inputValue()).toBe('page edit');
  expect(await field<string | null>(page, 'mode')).toBe('element');
});

test('⌘↵ sends the batch from anywhere in a mode', async ({ page, site }) => {
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

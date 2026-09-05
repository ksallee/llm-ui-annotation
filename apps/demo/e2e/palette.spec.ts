import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
  field,
  openSettings,
  openToolbar,
  overlay,
  ready,
  setMode,
} from './overlay.js';

const palette = (page: Page) =>
  overlay(page).locator('[aria-label="Command palette"]');

const search = (page: Page) =>
  overlay(page).locator('[aria-label="Search commands"]');

const rows = (page: Page) =>
  overlay(page).locator('.palette-row .palette-label');

test('the palette filters by comment text and jumps to the annotation', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'the call to action is too quiet');
  await page.keyboard.press('Escape');

  await page.keyboard.press('Alt+a');
  await expect(palette(page)).toBeVisible();
  await expect(rows(page).first()).toHaveText('Element mode');

  await search(page).fill('quiet');
  await expect(rows(page).first()).toContainText('#1 the call to action is too quiet');
  await page.keyboard.press('Enter');

  await expect.poll(() => field<boolean>(page, 'paletteOpen')).toBe(false);
  await expect(overlay(page).locator('[aria-label="Annotations"]')).toBeVisible();
  await expect(page.locator('[data-testid="signup"]')).toBeInViewport();
});

test('the palette switches modes and never offers a loop transition', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await ready(page);

  await page.keyboard.press('Alt+a');
  await search(page).fill('draw');
  await page.keyboard.press('Enter');
  await expect.poll(() => field<string | null>(page, 'mode')).toBe('page');

  await page.keyboard.press('Alt+a');
  await search(page).fill('approve');
  await expect(overlay(page).locator('.palette').getByText('Nothing matches.')).toBeVisible();
});

test('the palette key is rebindable and survives a reload', async ({ page, site }) => {
  await page.goto(`${site}/`);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Command palette shortcut' }).click();
  await page.keyboard.press('Control+Shift+K');
  await expect(settings.getByRole('button', { name: 'Command palette shortcut' })).toHaveText('⌃⇧K');
  await page.keyboard.press('Escape');

  await page.reload();
  await ready(page);
  expect(await field<string>(page, 'prefs.paletteKey')).toBe('Control+Shift+KeyK');

  await page.keyboard.press('Alt+a');
  expect(await field<boolean>(page, 'paletteOpen')).toBe(false);
  await page.keyboard.press('Control+Shift+K');
  await expect.poll(() => field<boolean>(page, 'paletteOpen')).toBe(true);
});

test('the drawing bar belongs to Draw mode alone', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await openToolbar(page);

  const bar = overlay(page).locator('[aria-label="Drawing tools"]');
  const pill = overlay(page).locator('[aria-label="Annotation toolbar"]');
  await expect(bar).toBeHidden();

  await setMode(page, 'Draw');
  await expect(bar).toBeVisible();
  await expect(bar.locator('[aria-label="Caption"]')).toBeVisible();
  await expect(pill.locator('[aria-label="Caption"]')).toHaveCount(0);
  await expect(pill.locator('[aria-label="Brush"]')).toHaveCount(0);

  await page.keyboard.press('3');
  await expect.poll(() => field<string>(page, 'drawTool')).toBe('rect');

  await setMode(page, 'Element');
  await expect(bar).toBeHidden();
});

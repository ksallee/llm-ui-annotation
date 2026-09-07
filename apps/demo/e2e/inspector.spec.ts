import type { ElementTarget } from '@llm-ui-annotation/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  centre,
  commit,
  clickHost,
  popup,
  openPanel,
  openSettings,
  overlay,
  panel,
  pointAt,
  sendBatch,
  setMode,
  storedAnnotations,
} from './overlay.js';

const channel = (page: Page, name: 'Notes' | 'Inspect') =>
  overlay(page).locator(`[aria-label="${name} channel"]`);

/** Select without opening the popup, the way ⇧ extends a selection. */
async function pick(page: Page, selector: string): Promise<void> {
  const at = await centre(page, selector);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
}

/** The rows of "what the agent will see", token chips stripped. */
function payload(page: Page): Promise<Record<string, string>> {
  return panel(page)
    .locator('.decls.payload')
    .evaluate((dl) => {
      const out: Record<string, string> = {};
      const names = [...dl.querySelectorAll('dt')];
      const values = [...dl.querySelectorAll('dd')];
      names.forEach((dt, i) => {
        const dd = values[i]!.cloneNode(true) as HTMLElement;
        dd.querySelector('.token')?.remove();
        out[dt.textContent!.trim()] = dd.textContent!.replace(/\s+/g, ' ').trim();
      });
      return out;
    });
}

test('the drawer switches channel with the selection, and the toggle holds', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);
  await expect(channel(page, 'Notes')).toHaveAttribute('aria-pressed', 'true');

  await pick(page, '[data-testid="signup"]');
  await expect(channel(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).locator('.inspect .sel')).toContainText('signup');

  // The toggle wins until the selection changes.
  await channel(page, 'Notes').click();
  await expect(channel(page, 'Notes')).toHaveAttribute('aria-pressed', 'true');
  await pick(page, '[data-plan="Free"] button');
  await expect(channel(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true');

  // Deselecting goes back to Notes.
  await page.keyboard.press('Escape');
  await expect(channel(page, 'Notes')).toHaveAttribute('aria-pressed', 'true');

  // So does leaving Element mode with something selected.
  await pick(page, '[data-testid="signup"]');
  await expect(channel(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true');
  await setMode(page, 'Highlight');
  await expect(channel(page, 'Notes')).toHaveAttribute('aria-pressed', 'true');
});

test('selecting an element never opens a closed drawer', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await expect(panel(page)).toBeHidden();

  await pick(page, '[data-testid="signup"]');
  await expect(panel(page)).toBeHidden();

  await openPanel(page);
  await expect(channel(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true');
});

test('the canvas reads like devtools: bands over the element, the numbers in the card', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');

  await pointAt(page, '[data-testid="signup"]');
  const bands = overlay(page).locator('.box-model');
  await expect(bands).toHaveCount(1);
  // Content, padding and border; the button has no margin.
  await expect(bands.locator('rect')).toHaveCount(1);
  await expect(bands.locator('path')).toHaveCount(2);
  await expect(overlay(page).locator('.box-num')).toHaveCount(0);

  await expect(overlay(page).locator('.element-card')).toContainText('8px 16px');
  await expect(overlay(page).locator('.element-card .size')).toHaveText(/\d+ × \d+/);

  // Devtools draws the bands whatever the size; only the numbers needed the room.
  await pointAt(page, '[data-testid="accent-teal"]');
  await expect(overlay(page).locator('.box-model')).toHaveCount(1);
});

test('the CSS details switch takes the box model off the canvas', async ({ page, site }) => {
  await page.goto(`${site}/`);
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'CSS details' }).click();
  await page.keyboard.press('Escape');

  await setMode(page, 'Element');
  await pointAt(page, '[data-testid="signup"]');
  await expect(overlay(page).locator('.box-model')).toHaveCount(0);
  await expect(overlay(page).locator('.element-card')).toHaveCount(0);
  await expect(overlay(page).locator('.label-chip')).toBeVisible();

  const again = await openSettings(page);
  await again.getByRole('switch', { name: 'CSS details' }).click();
  await page.keyboard.press('Escape');
  await pointAt(page, '[data-testid="signup"]');
  await expect(overlay(page).locator('.box-model')).toHaveCount(1);
  await expect(overlay(page).locator('.element-card')).toBeVisible();
});

test('a value changed in the panel previews on the page and rides with the note', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);
  await pick(page, '[data-testid="signup"]');

  const padding = panel(page).locator('input[aria-label="padding"]');
  await padding.fill('24px 40px');
  await padding.blur();

  // The page itself shows the proposal, from a stylesheet the overlay owns.
  await expect
    .poll(() => page.locator('[data-testid="signup"]').evaluate((el) => getComputedStyle(el).padding))
    .toBe('24px 40px');

  const token = panel(page).locator('select[aria-label="background-color token"]');
  await token.selectOption('--demo-accent');
  await expect(panel(page)).toContainText('2 changes pending');

  await clickHost(page, '[data-testid="signup"]');
  await expect(popup(page)).toContainText('carries 2 style changes');
  await commit(page, 'roomier, and on the accent');

  const stored = (await storedAnnotations(annotDir, '/'))[0]!;
  expect(stored.styleEdits).toEqual([
    {
      selector: expect.stringContaining('signup'),
      property: 'padding',
      from: '8px 16px',
      to: '24px 40px',
      token: null,
    },
    {
      selector: expect.stringContaining('signup'),
      property: 'background-color',
      from: 'rgb(44, 138, 133)',
      to: 'var(--demo-accent)',
      token: '--demo-accent',
    },
  ]);

  // Sent means done: the page goes back to what the code says.
  await expect
    .poll(() => page.locator('[data-testid="signup"]').evaluate((el) => getComputedStyle(el).padding))
    .toBe('8px 16px');
});

test('what the inspector shows is what the annotation carries', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);

  await pick(page, '[data-testid="signup"]');
  const shown = await payload(page);
  expect(Object.keys(shown).length).toBeGreaterThan(3);
  const tokens = await panel(page).locator('.token').allTextContents();
  expect(tokens).toContain('--demo-accent');

  await clickHost(page, '[data-testid="signup"]');
  await commit(page, 'make this say Start free');
  await sendBatch(page);

  const target = (await storedAnnotations(annotDir, '/'))[0]!.target as ElementTarget;
  const stored = Object.fromEntries(
    Object.entries(target.elements[0]!.styles ?? {}).map(([k, v]) => [k, v.replace(/\s+/g, ' ')]),
  );
  expect(shown).toEqual(stored);
  expect(Object.keys(shown)).toEqual(Object.keys(stored));
});

import type { ElementTarget } from '@llm-ui-annotation/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  centre,
  commit,
  clickHost,
  openPanel,
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
    .locator('.pairs.payload')
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

test('the box model draws over a padded element and declines under 24×24', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');

  await pointAt(page, '[data-testid="signup"]');
  await expect(overlay(page).locator('.box-model')).toHaveCount(1);
  const numbers = await overlay(page).locator('.box-num').allTextContents();
  // 8px 16px padding and a 1px border, each side once.
  expect(numbers.filter((n) => n.trim() === '16')).toHaveLength(2);
  expect(numbers.filter((n) => n.trim() === '8')).toHaveLength(2);
  expect(numbers.filter((n) => n.trim() === '1')).toHaveLength(4);

  const swatch = page.locator('[data-testid="accent-teal"]');
  const box = await swatch.boundingBox();
  expect(box!.width).toBeLessThan(24);
  await pointAt(page, '[data-testid="accent-teal"]');
  await expect(overlay(page).locator('.box-model')).toHaveCount(0);
  await expect(overlay(page).locator('.label-chip')).toBeVisible();
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

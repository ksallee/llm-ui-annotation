import { expect, test } from './fixtures.js';
import {
  annotateElement,
  contrast,
  exitMode,
  highlightStyle,
  overlay,
  ready,
  setMode,
  toRgb,
  token,
} from './overlay.js';

const ACCENTS = ['#f2b705', '#4f46e5', '#c2255c'];

test('the overlay follows the host accent on the hostile page', async ({ page, site }) => {
  await page.goto(`${site}/hostile/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="hostile-cta"]', 'this button needs a hover state');
  await exitMode(page);

  const marker = overlay(page).locator('.marker').first();
  await expect(marker).toBeVisible();

  const read = async () => ({
    accent: await token(page, '--annot-accent'),
    pill: await page
      .locator('annot-overlay')
      .locator('.pill')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    marker: await marker.evaluate((el) => getComputedStyle(el).backgroundColor),
    highlights: await highlightStyle(page),
  });

  const before = await read();
  expect(before.highlights).toContain('::highlight(annot-draft)');

  await page.locator(`[data-testid="accent-${ACCENTS[1]!.slice(1)}"]`).click();
  await expect.poll(() => token(page, '--annot-accent')).not.toBe(before.accent);

  const after = await read();
  expect(after.pill, 'the pill re-tints with the accent').not.toBe(before.pill);
  expect(after.marker, 'the marker re-tints with the accent').not.toBe(before.marker);
  expect(after.highlights, 'the ::highlight rules re-tint').not.toBe(before.highlights);
});

test('ink on surface clears 4.5:1 for three accents on a dark host', async ({ page, site }) => {
  await page.goto(`${site}/hostile/`);
  await ready(page);

  expect(await token(page, '--annot-color-scheme')).toBe('dark');

  for (const accent of ACCENTS) {
    await page.locator(`[data-testid="accent-${accent.slice(1)}"]`).click();
    await expect.poll(() => token(page, '--annot-accent')).not.toBe('');

    const ink = await toRgb(page, await token(page, '--annot-ink'));
    const surface = await toRgb(page, await token(page, '--annot-surface'));
    expect(contrast(ink, surface), `ink on surface for ${accent}`).toBeGreaterThanOrEqual(4.5);

    const accentInk = await toRgb(page, await token(page, '--annot-accent-ink'));
    const accentBg = await toRgb(page, await token(page, '--annot-accent'));
    expect(contrast(accentInk, accentBg), `accent ink for ${accent}`).toBeGreaterThanOrEqual(4.5);
  }
});

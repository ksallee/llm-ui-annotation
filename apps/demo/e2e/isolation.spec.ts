import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
  commit,
  exitMode,
  openPanel,
  openSettings,
  overlay,
  ready,
  selectPhrase,
  sendBatch,
  setMode,
  snapshot,
  token,
} from './overlay.js';

const mainHtml = (page: Page) =>
  page.locator('main').evaluate((el) => el.outerHTML);

const headMarkers = (page: Page) =>
  page.evaluate(() =>
    [...document.head.children]
      .filter((el) => [...el.attributes].some((a) => a.name.startsWith('data-annot')))
      .map((el) => el.tagName + ':' + [...el.attributes].map((a) => a.name).join(',')),
  );

test('a full session leaves the hostile host document untouched', async ({ page, site }) => {
  await page.goto(`${site}/hostile/`);
  await ready(page);
  const before = await mainHtml(page);

  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="hostile-cta"]', 'give this a hover state');

  await setMode(page, 'Highlight');
  await selectPhrase(page, 'main p.lede', 'resets every element');
  await overlay(page).locator('button.chip').click();
  await commit(page, 'this sentence is doing too much');

  await setMode(page, 'Draw');
  const box = (await page.locator('main').boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 160, { steps: 8 });
  await page.mouse.up();
  await overlay(page).locator('button.chip', { hasText: 'Annotate' }).click();
  await commit(page, 'this whole block is too dark');

  await exitMode(page);
  await overlay(page).locator('[aria-label="Pause animations"]').click();
  await overlay(page).locator('[aria-label="Pause animations"]').click();
  await overlay(page).locator('[aria-label^="Pin visibility"]').click();
  await openPanel(page);
  await openSettings(page);
  await page.keyboard.press('Escape');
  await sendBatch(page, 'everything at once');

  await expect.poll(() => snapshot(page).then((s) => s.counts['sent'])).toBe(3);
  expect(await mainHtml(page)).toBe(before);
  expect(await headMarkers(page)).toEqual(['STYLE:data-annot-highlights']);
});

test('the overlay keeps its own styles under a global `all: unset`', async ({ page, site }) => {
  await page.goto(`${site}/hostile/`);
  await ready(page);

  const hostButton = await page
    .locator('[data-testid="hostile-cta"]')
    .evaluate((el) => getComputedStyle(el).borderRadius);
  expect(hostButton).toBe('0px');

  await overlay(page).locator('[aria-label="Open the annotation toolbar"]').click();
  const pill = await overlay(page)
    .locator('.pill')
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, radius: s.borderRadius, bg: s.backgroundColor, z: s.zIndex };
    });
  expect(pill.display).toBe('flex');
  expect(pill.radius).toBe('999px');
  expect(pill.bg).not.toBe('rgba(0, 0, 0, 0)');

  const button = await overlay(page)
    .locator('button.icon-btn')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { cursor: s.cursor, display: s.display, font: s.fontFamily };
    });
  expect(button.cursor).toBe('pointer');
  expect(button.display).not.toBe('inline');
  expect(button.font).not.toBe('');

  // The host declared dark, so the overlay resolved dark rather than inheriting nothing.
  expect(await token(page, '--annot-color-scheme')).toBe('dark');
});

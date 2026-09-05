import type { ElementTarget } from '@llm-ui-annotation/core';
import { expect, test } from './fixtures.js';
import { commit, marquee, overlay, sendBatch, setMode, storedAnnotations } from './overlay.js';

test('a marquee round the card grid selects the three cards', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');

  const box = (await page.locator('.cards').boundingBox())!;
  await marquee(
    page,
    { x: box.x - 6, y: box.y - 6 },
    { x: box.x + box.width + 6, y: box.y + box.height + 6 },
  );

  await commit(page, 'Give the three plan cards the same height');
  await sendBatch(page);

  const stored = await storedAnnotations(annotDir, '/');
  expect(stored).toHaveLength(1);
  const target = stored[0]!.target as ElementTarget;
  expect(target.kind).toBe('element');
  expect(target.elements).toHaveLength(3);
  expect(target.elements.map((e) => e.tag)).toEqual(['article', 'article', 'article']);

  for (const ref of target.elements) {
    const tag = await page.evaluate((sel) => document.querySelector(sel)?.tagName, ref.selector);
    expect(tag, ref.selector).toBe('ARTICLE');
  }
  await expect(overlay(page).locator('.marker')).toHaveCount(1);
});

test('a marquee round one card selects that card', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');

  const box = (await page.locator('article[data-plan="Pro"]').boundingBox())!;
  await marquee(
    page,
    { x: box.x - 4, y: box.y - 4 },
    { x: box.x + box.width + 4, y: box.y + box.height + 4 },
  );

  await commit(page, 'Only the Pro card');
  await sendBatch(page);

  const target = (await storedAnnotations(annotDir, '/'))[0]!.target as ElementTarget;
  expect(target.elements).toHaveLength(1);
  expect(target.elements[0]!.attrs['data-plan']).toBe('Pro');
});

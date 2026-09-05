import type { TextTarget } from '@llm-ui-annotation/core';
import { expect, test } from './fixtures.js';
import {
  anchorOf,
  commit,
  overlay,
  ready,
  selectPhrase,
  sendBatch,
  setMode,
  snapshot,
  storedAnnotations,
} from './overlay.js';

const PHRASE = 'The margin is too tight here';

test('text mode anchors the second of two identical phrases', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');

  const first = await selectPhrase(page, '#twice', PHRASE, 1);
  const second = await selectPhrase(page, '#twice', PHRASE, 2);
  expect(second.y).toBeGreaterThan(first.y);

  const chip = overlay(page).locator('button.chip');
  await expect(chip).toBeEnabled();
  await expect(chip).toHaveText('Annotate');
  await chip.click();

  await commit(page, 'Loosen the margin on this sentence');
  await sendBatch(page);

  const stored = await storedAnnotations(annotDir, '/prose/');
  expect(stored).toHaveLength(1);
  const target = stored[0]!.target as TextTarget;
  expect(target.kind).toBe('text');
  expect(target.quote).toBe(PHRASE);
  expect(target.container.selector).toBe('#twice');

  // The quote alone is ambiguous; prefix and suffix are what pick the second copy.
  const body = await page.locator('#twice').innerText();
  expect(body.split(PHRASE)).toHaveLength(3);
  expect(target.prefix.length).toBeGreaterThan(0);
  expect(target.suffix.length).toBeGreaterThan(0);
  expect(target.prefix.trimEnd().endsWith('two never share a line.')).toBe(false);
  expect(target.start).toBeGreaterThan(body.indexOf(PHRASE) + PHRASE.length);

  const id = stored[0]!.id;
  const before = await anchorOf(page, id);
  expect(before?.state).toBe('exact');
  expect(Math.abs(before!.rects[0]!.y - second.y)).toBeLessThan(4);

  await page.reload();
  await ready(page);
  await expect.poll(() => snapshot(page).then((s) => s.annotations.length)).toBe(1);

  const after = await anchorOf(page, id);
  expect(after?.state).toBe('exact');
  expect(Math.abs(after!.rects[0]!.y - second.y)).toBeLessThan(4);
  expect(Math.abs(after!.rects[0]!.y - first.y)).toBeGreaterThan(10);
});

test('a selection crossing two blocks is one annotation naming both', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');

  await page.evaluate(() => {
    const from = document.querySelector('#once')!.firstChild!;
    const to = document.querySelector('#quote')!.firstChild!;
    const range = document.createRange();
    range.setStart(from, 5);
    range.setEnd(to, 20);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  const chip = overlay(page).locator('button.chip');
  await expect(chip).toBeEnabled();
  await expect(chip).toHaveText('Annotate');
  await chip.click();
  await commit(page, 'this thought runs across the quote');
  await sendBatch(page);

  const stored = await storedAnnotations(annotDir, '/prose/');
  expect(stored).toHaveLength(1);
  expect(stored[0]!.protocolVersion).toBe(2);
  const target = stored[0]!.target as TextTarget;
  expect(target.blocks?.map((b) => b.tag)).toEqual(['p', 'blockquote']);
  expect(target.container.selector).not.toBe('#once');

  const anchor = await anchorOf(page, stored[0]!.id);
  expect(anchor?.state).toBe('exact');
  const top = Math.min(...anchor!.rects.map((r) => r.y));
  const bottom = Math.max(...anchor!.rects.map((r) => r.y + r.height));
  const blocks = await page.evaluate(() => {
    const box = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    };
    return { once: box('#once'), quote: box('#quote') };
  });
  // The highlight starts inside the paragraph and ends inside the block quote.
  expect(top).toBeLessThan(blocks.once.bottom);
  expect(bottom).toBeGreaterThan(blocks.quote.top);
});

test('a selection spanning the whole body is refused, and says why', async ({ page, site }) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');

  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  const chip = overlay(page).locator('button.chip');
  await expect(chip).toBeDisabled();
  await expect(chip).toHaveText('that is the whole page');
  await expect.poll(() => snapshot(page).then((s) => s.chip?.enabled)).toBe(false);
});

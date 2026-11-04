import { PROTOCOL_VERSION, type TextTarget } from '@llm-ui-annotation/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  anchorOf,
  commit,
  field,
  overlay,
  popup,
  ready,
  selectPhrase,
  sendBatch,
  setMode,
  snapshot,
  storedAnnotations,
} from './overlay.js';

const PHRASE = 'The beagle sleeps under the window';

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
  expect(stored[0]!.protocolVersion).toBe(PROTOCOL_VERSION);
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

  await page.reload();
  await ready(page);
  await expect.poll(() => snapshot(page).then((s) => s.annotations.length)).toBe(1);
  expect((await anchorOf(page, stored[0]!.id))?.state).toBe('exact');
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

/** Drag the real mouse across a phrase, start to end, the way a reader selects it. */
async function dragAcross(page: Page, container: string, phrase: string, occurrence = 1): Promise<void> {
  await page.locator(container).scrollIntoViewIfNeeded();
  await selectPhrase(page, container, phrase, occurrence);
  const box = await page.evaluate(() => {
    const selection = document.getSelection()!;
    const rects = [...selection.getRangeAt(0).getClientRects()].filter((r) => r.width > 0);
    selection.removeAllRanges();
    const first = rects[0]!;
    const last = rects.at(-1)!;
    return { x0: first.left + 1, y0: first.top + first.height / 2, x1: last.right - 1, y1: last.top + last.height / 2 };
  });
  await page.mouse.move(box.x0, box.y0);
  await page.mouse.down();
  await page.mouse.move(box.x1, box.y1, { steps: 8 });
  await page.mouse.up();
}

test('releasing the mouse on a highlight opens its note', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');

  await dragAcross(page, '#twice', PHRASE, 1);
  await expect(popup(page)).toBeVisible();
  await expect.poll(() => field<string>(page, 'popup.target.quote')).toBe(PHRASE);
  await expect(overlay(page).locator('button.chip')).toHaveCount(0);

  await commit(page, 'This sentence can go');
  await expect.poll(() => storedAnnotations(annotDir, '/prose/').then((s) => s.length)).toBe(1);
  const stored = await storedAnnotations(annotDir, '/prose/');
  expect((stored[0]!.target as TextTarget).quote).toBe(PHRASE);
});

test('a selection made without the mouse waits for the chip', async ({ page, site }) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');

  await selectPhrase(page, '#twice', PHRASE, 1);
  await expect(overlay(page).locator('button.chip')).toHaveText('Annotate');
  await expect(popup(page)).toBeHidden();
});

test('selecting again while the note is empty moves the note', async ({ page, site }) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');

  await dragAcross(page, '#twice', PHRASE, 1);
  await expect.poll(() => field<string>(page, 'popup.target.quote')).toBe(PHRASE);

  await dragAcross(page, '#twice', 'A first sentence');
  await expect.poll(() => field<string>(page, 'popup.target.quote')).toBe('A first sentence');
  await expect(popup(page)).toHaveCount(1);
});

test('selecting again keeps a note that has words in it', async ({ page, site }) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');

  await dragAcross(page, '#twice', PHRASE, 1);
  await popup(page).locator('textarea').fill('half a thought');

  await dragAcross(page, '#twice', 'A first sentence');
  await expect.poll(() => field<string>(page, 'popup.target.quote')).toBe(PHRASE);
  await expect(popup(page).locator('textarea')).toHaveValue('half a thought');
});

test('a double-click opens the word, and shift+click extends it while the note is empty', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');
  await page.locator('#twice').scrollIntoViewIfNeeded();
  await selectPhrase(page, '#twice', 'first sentence opens');
  const words = await page.evaluate(() => {
    const selection = document.getSelection()!;
    const box = selection.getRangeAt(0).getBoundingClientRect();
    selection.removeAllRanges();
    return { start: box.left + 3, end: box.right - 2, y: box.top + box.height / 2 };
  });

  await page.mouse.click(words.start, words.y, { clickCount: 2 });
  await expect.poll(() => field<string>(page, 'popup.target.quote')).toBe('first');

  await page.keyboard.down('Shift');
  await page.mouse.click(words.end, words.y);
  await page.keyboard.up('Shift');
  await expect.poll(() => field<string>(page, 'popup.target.quote')).toMatch(/^first sentence open/);
});

/** The text the overlay paints as the note's pending selection, null when it paints none. */
const pending = (page: Page) =>
  page.evaluate(() => {
    const registry = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights;
    const ranges = registry.get('annot-pending');
    return ranges ? [...ranges].map((r) => r.toString()).join('') : null;
  });

test('the selected text stays marked while its note is open, and only then', async ({ page, site }) => {
  await page.goto(`${site}/prose/`);
  await setMode(page, 'Highlight');

  await dragAcross(page, '#twice', PHRASE, 1);
  await expect(popup(page)).toBeVisible();
  await popup(page).locator('textarea').fill('still looking at it');
  expect(await page.evaluate(() => document.getSelection()?.toString() ?? '')).toBe('');
  await expect.poll(() => pending(page)).toBe(PHRASE);

  await page.keyboard.press('Escape');
  await expect(popup(page)).toBeHidden();
  await expect.poll(() => pending(page)).toBeNull();
});

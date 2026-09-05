import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { PageTarget } from '@llm-ui-annotation/core';
import { expect, test } from './fixtures.js';
import { commit, field, overlay, sendBatch, setMode, storedAnnotations } from './overlay.js';

const tool = (page: Page, label: string) =>
  overlay(page).locator(`[aria-label="${label}"]`);

test('page mode draws, captures a screenshot and lists the elements under it', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');

  const box = (await page.locator('.cards').boundingBox())!;

  await tool(page, 'Rectangle').click();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 10 });
  await page.mouse.up();

  await tool(page, 'Arrow').click();
  await page.mouse.move(box.x + 40, box.y + box.height + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 40, { steps: 10 });
  await page.mouse.up();

  await tool(page, 'Caption').click();
  await page.mouse.click(box.x + 30, box.y - 20);
  const input = overlay(page).locator('input.label-input');
  await expect(input).toBeVisible();
  await input.fill('too cramped');
  await input.press('Enter');

  await expect.poll(() => field<{ strokes: unknown[] }>(page, 'drawing').then((d) => d.strokes.length)).toBe(3);

  await overlay(page).locator('button.chip', { hasText: 'Annotate' }).click();
  await commit(page, 'These three cards need more room');
  await sendBatch(page);

  const stored = await storedAnnotations(annotDir, '/');
  expect(stored).toHaveLength(1);
  const target = stored[0]!.target as PageTarget;
  expect(target.kind).toBe('page');
  expect(target.strokes.map((s) => s.tool).sort()).toEqual(['arrow', 'label', 'rect']);
  expect(target.elements.length).toBeGreaterThan(0);

  expect(target.screenshot, 'the optional modern-screenshot peer is installed in apps/demo').not.toBeNull();
  const file = join(annotDir, target.screenshot!);
  const png = await readFile(file);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(Math.max(width, height)).toBeLessThanOrEqual(1600);
  expect(width).toBeGreaterThan(100);
  expect((await stat(file)).size).toBeGreaterThan(1000);
});

test('undo and redo walk the stroke stack', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');

  const box = (await page.locator('.cards').boundingBox())!;
  for (const dy of [0, 30]) {
    await page.mouse.move(box.x + 20, box.y + 20 + dy);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 60 + dy, { steps: 6 });
    await page.mouse.up();
  }
  const strokes = () => field<{ strokes: unknown[] }>(page, 'drawing').then((d) => d.strokes.length);
  await expect.poll(strokes).toBe(2);

  await tool(page, 'Undo stroke').click();
  await expect.poll(strokes).toBe(1);
  await tool(page, 'Redo stroke').click();
  await expect.poll(strokes).toBe(2);
  await tool(page, 'Clear drawing').click();
  await expect.poll(strokes).toBe(0);
});

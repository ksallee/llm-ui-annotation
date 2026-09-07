import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { PageTarget } from '@llm-ui-annotation/core';
import { expect, test } from './fixtures.js';
import { clickHost, commit, field, overlay, popup, sendBatch, setMode, storedAnnotations } from './overlay.js';

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

  // Both start inside the rectangle's box, so all three marks are one drawing.
  await tool(page, 'Arrow').click();
  await page.mouse.move(box.x + 40, box.y + box.height - 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 40, { steps: 10 });
  await page.mouse.up();

  await tool(page, 'Caption').click();
  await page.mouse.click(box.x + 30, box.y + 20);
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

test('the draw region resizes, and Fit to drawing puts it back', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');

  const box = (await page.locator('article[data-plan="Pro"]').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 70, { steps: 8 });
  await page.mouse.up();

  const region = () => field<{ width: number; height: number }>(page, 'drawingRegion');
  const fitted = (await region())!;

  await tool(page, 'Frame').click();
  await page.mouse.click(box.x + 50, box.y + 45);
  await expect.poll(() => field<number>(page, 'regionElements')).toBeGreaterThan(0);
  const before = await field<number>(page, 'regionElements');

  const handle = overlay(page).locator('[aria-label="Resize the drawing region, se"]');
  const at = (await handle.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 240, at.y + 200, { steps: 10 });
  await page.mouse.up();

  const grown = (await region())!;
  expect(grown.width).toBeGreaterThan(fitted.width + 100);
  await expect.poll(() => field<number>(page, 'regionElements')).toBeGreaterThan(before);

  await overlay(page).locator('button.chip', { hasText: 'Annotate' }).click();
  await commit(page, 'this whole area needs room');
  await sendBatch(page);

  const target = (await storedAnnotations(annotDir, '/'))[0]!.target as PageTarget;
  expect(target.region.width).toBeGreaterThan(fitted.width + 100);
  expect(target.elements.length).toBeGreaterThanOrEqual(before);
});

test('Fit to drawing restores the strokes bounds', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');

  const box = (await page.locator('article[data-plan="Pro"]').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 70, { steps: 8 });
  await page.mouse.up();
  const fitted = (await field<{ width: number }>(page, 'drawingRegion'))!;

  await tool(page, 'Frame').click();
  await page.mouse.click(box.x + 50, box.y + 45);
  const handle = overlay(page).locator('[aria-label="Resize the drawing region, se"]');
  const at = (await handle.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 200, at.y + 160, { steps: 8 });
  await page.mouse.up();
  expect((await field<{ width: number }>(page, 'drawingRegion'))!.width).toBeGreaterThan(fitted.width);

  await overlay(page).getByRole('button', { name: 'Fit to drawing' }).click();
  await expect.poll(() => field<{ width: number } | null>(page, 'drawingRegion').then((r) => r!.width)).toBe(
    fitted.width,
  );
});

/** Draw one rectangle and return the box it was drawn in. */
async function drawRect(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

const drawingBox = (page: Page, id?: string) =>
  page.evaluate((key) => {
    const el = document.querySelector('annot-overlay') as {
      state?: { routeDrawings: { id: string; region: unknown }[] };
    } | null;
    const list = el?.state?.routeDrawings ?? [];
    const found = key ? list.find((d) => d.id === key) : list[0];
    return JSON.parse(JSON.stringify(found?.region ?? null)) as {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
  }, id);

const strokeXs = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('annot-overlay') as {
      state?: { routeDrawings: { strokes: { rect?: { x: number } }[] }[] };
    } | null;
    return (el?.state?.routeDrawings[0]?.strokes ?? []).map((s) => s.rect?.x ?? -1);
  });

test('Move selects a whole drawing and carries its marks with the box', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');
  const box = (await page.locator('article[data-plan="Free"]').boundingBox())!;

  await tool(page, 'Rectangle').click();
  await drawRect(page, { x: box.x + 20, y: box.y + 20 }, { x: box.x + 100, y: box.y + 70 });

  await tool(page, 'Move').click();
  await page.mouse.click(box.x + 60, box.y + 45);
  await expect
    .poll(() => page.evaluate(() => {
      const el = document.querySelector('annot-overlay') as { state?: { selectedDrawings: Set<string> } } | null;
      return el?.state?.selectedDrawings.size ?? 0;
    }))
    .toBe(1);

  const before = (await drawingBox(page))!;
  const strokesBefore = await strokeXs(page);
  await page.mouse.move(box.x + 60, box.y + 45);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 45, { steps: 8 });
  await page.mouse.up();

  const after = (await drawingBox(page))!;
  expect(Math.round(after.x - before.x)).toBeGreaterThan(80);
  expect(Math.round((await strokeXs(page))[0]! - strokesBefore[0]!)).toBe(Math.round(after.x - before.x));
});

test('double-click steps inside and moves one stroke alone', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');
  const box = (await page.locator('.cards').boundingBox())!;

  // The second rectangle starts inside the first one's box, so the two are one drawing.
  await tool(page, 'Rectangle').click();
  await drawRect(page, { x: box.x + 20, y: box.y + 20 }, { x: box.x + 160, y: box.y + 120 });
  await drawRect(page, { x: box.x + 140, y: box.y + 100 }, { x: box.x + 260, y: box.y + 200 });
  await expect.poll(() => strokeXs(page).then((xs) => xs.length)).toBe(2);

  await tool(page, 'Move').click();
  await page.mouse.dblclick(box.x + 50, box.y + 50);
  await expect.poll(() => field<string | null>(page, 'insideDrawing')).not.toBeNull();
  await expect.poll(() => field<number[]>(page, 'selectedStrokes')).not.toEqual([]);

  const before = await strokeXs(page);
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 50, { steps: 8 });
  await page.mouse.up();

  const after = await strokeXs(page);
  expect(Math.round(after[0]! - before[0]!)).toBeGreaterThan(50);
  expect(after[1]).toBe(before[1]);

  await page.keyboard.press('Escape');
  await expect.poll(() => field<string | null>(page, 'insideDrawing')).toBeNull();
  await expect.poll(() => field<string | null>(page, 'mode')).toBe('page');
});

test('Frame moves the capture box and leaves the marks where they are', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');
  const box = (await page.locator('article[data-plan="Free"]').boundingBox())!;

  await tool(page, 'Rectangle').click();
  await drawRect(page, { x: box.x + 20, y: box.y + 20 }, { x: box.x + 90, y: box.y + 70 });

  await tool(page, 'Frame').click();
  await page.mouse.click(box.x + 55, box.y + 45);
  const before = (await drawingBox(page))!;
  const strokesBefore = await strokeXs(page);

  await page.mouse.move(box.x + 55, box.y + 45);
  await page.mouse.down();
  await page.mouse.move(box.x + 145, box.y + 45, { steps: 8 });
  await page.mouse.up();

  expect(Math.round((await drawingBox(page))!.x - before.x)).toBeGreaterThan(70);
  expect(await strokeXs(page)).toEqual(strokesBefore);
});

test('leaving Draw keeps the drawings as drafts and lets a click reach what is under them', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');
  const target = (await page.locator('article[data-plan="Pro"] button').boundingBox())!;

  await tool(page, 'Rectangle').click();
  await drawRect(
    page,
    { x: target.x - 40, y: target.y - 40 },
    { x: target.x + target.width + 40, y: target.y + target.height + 40 },
  );

  await setMode(page, 'Element');
  await expect.poll(() => storedAnnotations(annotDir, '/').then((a) => a.length)).toBe(1);
  const stored = (await storedAnnotations(annotDir, '/'))[0]!;
  expect(stored.status).toBe('draft');
  expect(stored.comment).toBe('');

  await clickHost(page, 'article[data-plan="Pro"] button');
  await expect(popup(page)).toBeVisible();
  await popup(page).getByRole('button', { name: /details/ }).click();
  await expect(popup(page).locator('.detail')).toContainText('Choose Pro');
});

test('one Draw session is one drawing, wherever the marks land', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');
  const free = (await page.locator('article[data-plan="Free"]').boundingBox())!;
  const team = (await page.locator('article[data-plan="Team"]').boundingBox())!;

  await tool(page, 'Rectangle').click();
  await drawRect(page, { x: free.x + 20, y: free.y + 20 }, { x: free.x + 90, y: free.y + 70 });
  await drawRect(page, { x: team.x + 20, y: team.y + 20 }, { x: team.x + 90, y: team.y + 70 });

  // Far apart, and still one note: the session is the unit, not the distance between marks.
  await expect.poll(() => strokeXs(page).then((xs) => xs.length)).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.querySelector('annot-overlay') as { state?: { drawings: unknown[] } } | null;
        return el?.state?.drawings.length ?? 0;
      }),
    )
    .toBe(1);
});

test('the page is held still while drawing, and free again after', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Draw');
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

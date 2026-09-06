import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
  commit,
  openPanel,
  overlay,
  panel,
  sendBatch,
  setMode,
  snapshot,
} from './overlay.js';

const row = (page: Page, n: number) =>
  panel(page).locator('.entry', { has: page.locator(`text="#${n}"`) }).first();

const statuses = async (page: Page) =>
  (await snapshot(page)).annotations.sort((a, b) => a.number - b.number).map((a) => a.status);

test('a collapsed row sends its draft without being expanded', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'clearer label please');
  await openPanel(page);

  const first = row(page, 1);
  await expect(first.locator('button.head')).toHaveAttribute('aria-expanded', 'false');
  await first.getByRole('button', { name: 'Send annotation 1' }).click();

  await expect.poll(() => statuses(page)).toEqual(['sent']);
  await expect(first.locator('button.head')).toHaveAttribute('aria-expanded', 'false');
});

test('a row names its status, and a sent row still offers an action', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'clearer label please');
  await openPanel(page);

  const first = row(page, 1);
  await expect(first.locator('.status-pill').first()).toHaveText('draft');
  await expect(first.getByRole('button', { name: 'Send annotation 1' })).toBeVisible();

  await sendBatch(page);
  await expect(first.locator('.status-pill').first()).toHaveText('sent');
  await expect(first.getByRole('button', { name: 'Comment on annotation 1' })).toBeVisible();
});

test('the target line keeps the element name and gives up the selector', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, 'article[data-plan="Pro"] button', 'rename this');
  await openPanel(page);

  const first = row(page, 1);
  await expect(first.locator('.name')).toHaveText('button "Choose Pro"');
  const clipped = await first.locator('.name').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped, 'the name fits without an ellipsis').toBe(false);
});

test('a drawing shows its marks in the row, an element note shows the mode icon', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'an element note');

  await setMode(page, 'Draw');
  const box = (await page.locator('.cards').boundingBox())!;
  await overlay(page).locator('[aria-label="Rectangle"]').click();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 10 });
  await page.mouse.up();
  await overlay(page).locator('button.chip', { hasText: 'Annotate' }).click();
  await commit(page, 'this grid is cramped');

  await openPanel(page);
  await expect(row(page, 2).locator('.thumb .marks')).toBeVisible();
  await expect(row(page, 1).locator('.thumb .marks')).toHaveCount(0);
});

test('three review rows approve together in one step', async ({
  page,
  site,
  agent,
}) => {
  test.setTimeout(90_000);
  agent.start();

  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'one');
  await annotateElement(page, 'article[data-plan="Team"]', 'two');
  await annotateElement(page, '#features-heading', 'three');
  await sendBatch(page);

  await expect.poll(() => statuses(page), { timeout: 45_000 }).toEqual(['review', 'review', 'review']);

  await openPanel(page);
  await panel(page).getByRole('button', { name: /^All/ }).click();

  await row(page, 1).locator('input.pick').click();
  await row(page, 3).locator('input.pick').click({ modifiers: ['Shift'] });
  await expect(panel(page).locator('.bulk')).toContainText('3 selected');

  const bulk = panel(page).locator('.bulk');
  const approve = bulk.getByRole('button', { name: /^Approve \(3\)/ });
  await expect(approve).toBeEnabled();
  await expect(bulk.getByRole('button', { name: /^Send/ })).toBeDisabled();
  // The bar floats at the top of the list, not at the bottom of the drawer.
  await expect(bulk).toBeInViewport();
  const above = await bulk.evaluate(
    (el) => el.getBoundingClientRect().bottom <= el.parentElement!.querySelector('.entry')!.getBoundingClientRect().top + 1,
  );
  expect(above, 'the bulk bar sits above the first row').toBe(true);
  await approve.click();

  await expect.poll(() => statuses(page)).toEqual(['approved', 'approved', 'approved']);
  await expect(overlay(page).locator('.toast')).toHaveCount(1);
  await expect(overlay(page).locator('.toast')).toContainText('Approved 3');
});

test('a mixed selection acts on the rows that allow it and says how many', async ({
  page,
  site,
  agent,
}) => {
  test.setTimeout(90_000);
  agent.start();

  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'one');
  await sendBatch(page);
  await expect.poll(() => statuses(page), { timeout: 45_000 }).toEqual(['review']);

  await annotateElement(page, 'article[data-plan="Team"]', 'a fresh draft');
  await openPanel(page);
  await panel(page).getByRole('button', { name: /^All/ }).click();

  await row(page, 1).locator('input.pick').click();
  await row(page, 2).locator('input.pick').click();

  const bulk = panel(page).locator('.bulk');
  await expect(bulk).toContainText('2 selected');
  // One review + one draft: each action names the subset it would touch and stays live for it.
  const approve = bulk.getByRole('button', { name: /^Approve \(1 of 2\)/ });
  await expect(approve).toBeEnabled();
  await expect(bulk.getByRole('button', { name: /^Send \(1 of 2\)/ })).toBeEnabled();
  await expect(bulk.getByRole('button', { name: /^Delete \(1 of 2\)/ })).toBeEnabled();

  await approve.click();
  await expect.poll(() => statuses(page)).toEqual(['approved', 'draft']);
});

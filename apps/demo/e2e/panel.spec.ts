import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
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
  await first.locator('button.inline-action').click();

  await expect.poll(() => statuses(page)).toEqual(['sent']);
  await expect(first.locator('button.head')).toHaveAttribute('aria-expanded', 'false');
});

test('three review rows approve together, and a mixed selection disables what is illegal', async ({
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
  await panel(page).getByRole('button', { name: 'All', exact: true }).click();

  await row(page, 1).locator('input.pick').click();
  await row(page, 3).locator('input.pick').click({ modifiers: ['Shift'] });
  await expect(panel(page).locator('footer')).toContainText('3 selected');

  const approve = panel(page).locator('footer').getByRole('button', { name: /^Approve \(3\)/ });
  await expect(approve).toBeEnabled();
  await expect(panel(page).locator('footer').getByRole('button', { name: /^Send/ })).toBeDisabled();
  await approve.click();

  await expect.poll(() => statuses(page)).toEqual(['approved', 'approved', 'approved']);
  await expect(overlay(page).locator('.toast')).toHaveCount(1);
  await expect(overlay(page).locator('.toast')).toContainText('Approved 3');
});

test('a mixed selection offers only the transitions every row allows', async ({
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
  await panel(page).getByRole('button', { name: 'All', exact: true }).click();

  await row(page, 1).locator('input.pick').click();
  await row(page, 2).locator('input.pick').click();

  const footer = panel(page).locator('footer');
  await expect(footer).toContainText('2 selected');
  await expect(footer.getByRole('button', { name: /^Approve \(1\)/ })).toBeDisabled();
  await expect(footer.getByRole('button', { name: /^Send \(1\)/ })).toBeDisabled();
  await expect(footer.getByRole('button', { name: /^Delete \(1\)/ })).toBeDisabled();
});

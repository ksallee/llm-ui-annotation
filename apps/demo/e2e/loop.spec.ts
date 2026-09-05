import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
  expandRow,
  overlay,
  panel,
  sendBatch,
  setMode,
  snapshot,
  storedAnnotations,
} from './overlay.js';

const byNumber = async (page: Page, n: number) =>
  (await snapshot(page)).annotations.find((a) => a.number === n)!;

test('the whole loop: send, ack, ask, decline, answer, approve all', async ({
  page,
  site,
  annotDir,
  agent,
}) => {
  test.setTimeout(90_000);
  agent.start();

  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'fix the label on this button');
  await annotateElement(page, 'article[data-plan="Team"]', 'ask: which price should it show?');
  await annotateElement(page, '#features-heading', 'decline: turn this heading into a carousel');
  await sendBatch(page, 'Three things on the home page');

  await expect
    .poll(async () => (await snapshot(page)).annotations.map((a) => a.status).join(','), {
      timeout: 45_000,
    })
    .toBe('review,question,review');

  const declined = await byNumber(page, 3);
  expect(declined.resolution?.kind).toBe('declined');
  expect(declined.resolution?.summary).toContain('fake:');
  const changed = await byNumber(page, 1);
  expect(changed.resolution?.kind).toBe('changed');

  const asked = await byNumber(page, 2);
  expect(asked.thread.at(-1)?.kind).toBe('question');
  expect(asked.thread.at(-1)?.role).toBe('agent');

  const row = await expandRow(page, 2);
  await row.locator('textarea.field').fill('The monthly one, $29');
  await row.locator('.actions').getByRole('button', { name: 'Answer' }).click();

  await expect
    .poll(async () => (await byNumber(page, 2)).status, { timeout: 45_000 })
    .toBe('review');

  await panel(page).getByRole('button', { name: /Approve all/ }).click();

  await expect.poll(() => snapshot(page).then((s) => s.counts['approved'])).toBe(3);
  await expect(overlay(page).locator('.marker')).toHaveCount(0);
  await expect(overlay(page).locator('.layer.highlights .outline')).toHaveCount(0);

  await panel(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel(page).locator('.entry')).toHaveCount(3);

  const stored = await storedAnnotations(annotDir, '/');
  expect(stored.map((a) => a.status)).toEqual(['approved', 'approved', 'approved']);
  expect(stored.every((a) => a.approvedAt !== null)).toBe(true);
});

test('reopening a reviewed item sends it back to the agent', async ({ page, site, agent }) => {
  test.setTimeout(90_000);
  agent.start();

  await page.goto(`${site}/prose/`);
  await setMode(page, 'Element');
  await annotateElement(page, 'h1', 'shorten this heading');
  await sendBatch(page);

  await expect.poll(async () => (await byNumber(page, 1)).status, { timeout: 45_000 }).toBe('review');

  const row = await expandRow(page, 1);
  await row.locator('textarea.field').fill('Still too long');
  await row.locator('.actions').getByRole('button', { name: 'Reopen' }).click();

  await expect
    .poll(async () => (await byNumber(page, 1)).status, { timeout: 45_000 })
    .toBe('review');
  const again = await byNumber(page, 1);
  expect(again.thread.filter((m) => m.kind === 'summary')).toHaveLength(2);
  expect(again.thread.some((m) => m.kind === 'reopen')).toBe(true);
});

import { expect, test } from './fixtures.js';
import {
  annotateElement,
  clickHost,
  openSettings,
  overlay,
  popup,
  routeFile,
  setMode,
  snapshot,
  storedAnnotations,
} from './overlay.js';

test('immediate mode sends on Add and keeps the badge on agent activity', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/app/`);
  const settings = await openSettings(page);
  const send = settings.getByRole('radio', { name: /Send, then review/ });
  await send.click();
  await expect(send).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  await setMode(page, 'Element');
  await expect(overlay(page).locator('button.send-btn')).toHaveCount(0);

  await annotateElement(page, '[data-testid="save"]', 'label this Save workspace');

  await expect.poll(() => snapshot(page).then((s) => s.counts['sent'])).toBe(1);
  const after = await snapshot(page);
  expect(after.counts['draft']).toBe(0);
  expect(after.badge).toBe(0);
  await expect(overlay(page).locator('.marker.sent')).toHaveCount(1);

  const stored = await storedAnnotations(annotDir, '/app/');
  expect(stored).toHaveLength(1);
  expect(stored[0]!.status).toBe('sent');
  expect(stored[0]!.batch).not.toBeNull();
  expect(stored[0]!.sentAt).not.toBeNull();

  // Known gap in packages/svelte: immediate mode makes one batch per annotation, with no debounce.
  await annotateElement(page, '[data-testid="invite"]', 'move this button to the sidebar');
  await expect.poll(() => storedAnnotations(annotDir, '/app/').then((a) => a.length)).toBe(2);
  const file = (await routeFile(annotDir, '/app/'))!;
  const batches = new Set(file.annotations.map((a) => a.batch));
  expect(batches.size).toBe(2);
});

test('send and approve needs nothing from the user once the agent is done', async ({
  page,
  site,
  annotDir,
  agent,
}) => {
  await page.goto(`${site}/app/`);
  const settings = await openSettings(page);
  await settings.getByRole('radio', { name: /Send and approve/ }).click();
  await page.keyboard.press('Escape');
  agent.start();

  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="save"]', 'tighten this');

  // No review step: the agent reports done and the note is approved without being touched.
  await expect
    .poll(() => storedAnnotations(annotDir, '/app/').then((all) => all[0]?.status), {
      timeout: 20_000,
    })
    .toBe('approved');
});

test('the popup primary button reads Send in immediate mode', async ({ page, site }) => {
  await page.goto(`${site}/app/`);
  const settings = await openSettings(page);
  await settings.getByRole('radio', { name: /Send, then review/ }).click();
  await page.keyboard.press('Escape');
  await setMode(page, 'Element');

  await clickHost(page, '[data-testid="save"]');
  await expect(popup(page).locator('button.primary')).toHaveText(/Send/);
});

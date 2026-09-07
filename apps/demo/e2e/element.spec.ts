import type { ElementTarget } from '@llm-ui-annotation/core';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
  centre,
  expandRow,
  overlay,
  pointAt,
  popup,
  sendBatch,
  setMode,
  snapshot,
  storedAnnotations,
} from './overlay.js';

test('the popup can send one note straight out of batch mode', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');

  const at = await centre(page, '[data-testid="signup"]');
  await page.mouse.click(at.x, at.y);
  await popup(page).locator('textarea.field').fill('send this one now');
  await popup(page).getByRole('button', { name: /^Send/ }).click();
  await expect(popup(page)).toBeHidden();

  await expect.poll(() => snapshot(page).then((s) => s.counts['sent'])).toBe(1);
  const stored = await storedAnnotations(annotDir, '/');
  expect(stored).toHaveLength(1);
  expect(stored[0]!.status).toBe('sent');
  expect(stored[0]!.batch).not.toBeNull();
});

test('element mode: hover, popup, draft, send, marker', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');

  await pointAt(page, '[data-testid="signup"]');
  const card = overlay(page).locator('.element-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.node')).toContainText('button');

  const at = await centre(page, '[data-testid="signup"]');
  await page.mouse.click(at.x, at.y);
  await expect(popup(page)).toBeVisible();
  await popup(page).getByRole('button', { name: /details/ }).click();
  await expect(popup(page).locator('.detail .breadcrumb')).toContainText('Sign up');

  await popup(page).locator('textarea.field').fill('Make this button say "Start free"');
  await popup(page).locator('button.primary').click();
  await expect(popup(page)).toBeHidden();

  const drafted = await snapshot(page);
  expect(drafted.counts['draft']).toBe(1);
  expect(drafted.badge).toBe(1);
  await expect(overlay(page).locator('.marker.draft')).toHaveCount(1);

  await sendBatch(page, 'One button');

  await expect.poll(() => snapshot(page).then((s) => s.counts['sent'])).toBe(1);
  await expect(overlay(page).locator('.marker.sent')).toHaveCount(1);

  const stored = await storedAnnotations(annotDir, '/');
  expect(stored).toHaveLength(1);
  const [annotation] = stored;
  expect(annotation!.status).toBe('sent');
  expect(annotation!.batch).not.toBeNull();
  expect(annotation!.mode).toBe('element');

  const target = annotation!.target as ElementTarget;
  expect(target.kind).toBe('element');
  expect(target.elements).toHaveLength(1);
  const { selector, name } = target.elements[0]!;
  expect(name).toContain('Sign up');
  const resolves = await page.evaluate(
    (sel) => document.querySelector(sel) === document.querySelector('[data-testid="signup"]'),
    selector,
  );
  expect(resolves, `selector ${selector} should resolve to the button`).toBe(true);
});

test('a draft can be deleted from the panel and never reaches the file', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'temporary');

  await expect.poll(() => snapshot(page).then((s) => s.counts['draft'])).toBe(1);
  const before = await storedAnnotations(annotDir, '/');
  expect(before).toHaveLength(1);
  expect(before[0]!.status).toBe('draft');

  const row = await expandRow(page, 1);
  await row.getByRole('button', { name: 'More actions on annotation 1' }).click();
  await row.getByRole('button', { name: 'Delete' }).click();

  await expect.poll(() => snapshot(page).then((s) => s.annotations.length)).toBe(0);
  await expect.poll(() => storedAnnotations(annotDir, '/').then((a) => a.length)).toBe(0);
});

test('an element inside an open shadow root gets a >>> selector', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/app/`);
  await setMode(page, 'Element');
  await annotateElement(page, 'shadow-card', 'this deep button needs a focus ring');
  await sendBatch(page);

  const target = (await storedAnnotations(annotDir, '/app/'))[0]!.target as ElementTarget;
  const { selector } = target.elements[0]!;
  expect(selector).toContain('>>>');
  const found = await page.evaluate((sel) => {
    const [host, inner] = sel.split(' >>> ');
    return document.querySelector(host!)?.shadowRoot?.querySelector(inner!)?.tagName ?? null;
  }, selector);
  expect(found).not.toBeNull();
});

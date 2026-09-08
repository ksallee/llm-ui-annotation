import type { ElementTarget } from '@llm-ui-annotation/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotate,
  centre,
  clickHost,
  commit,
  popup,
  openPanel,
  openSettings,
  overlay,
  panel,
  pointAt,
  sendBatch,
  setMode,
  storedAnnotations,
} from './overlay.js';

const channel = (page: Page, name: 'Notes' | 'Inspect') =>
  overlay(page).locator(`[aria-label="${name} channel"]`);

/** Select without opening the popup, the way ⇧ extends a selection. */
async function pick(page: Page, selector: string): Promise<void> {
  const at = await centre(page, selector);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
}

/** The rows of "what the agent will see", token chips stripped. */
function payload(page: Page): Promise<Record<string, string>> {
  return panel(page)
    .locator('.decls.payload')
    .evaluate((dl) => {
      const out: Record<string, string> = {};
      const names = [...dl.querySelectorAll('dt')];
      const values = [...dl.querySelectorAll('dd')];
      names.forEach((dt, i) => {
        const dd = values[i]!.cloneNode(true) as HTMLElement;
        dd.querySelector('.token')?.remove();
        out[dt.textContent!.trim()] = dd.textContent!.replace(/\s+/g, ' ').trim();
      });
      return out;
    });
}

test('the drawer switches channel with the selection, and the toggle holds', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);
  await expect(channel(page, 'Notes')).toHaveAttribute('aria-pressed', 'true');

  await pick(page, '[data-testid="signup"]');
  await expect(channel(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).locator('.inspect .sel')).toContainText('signup');

  // The toggle wins until the selection changes.
  await channel(page, 'Notes').click();
  await expect(channel(page, 'Notes')).toHaveAttribute('aria-pressed', 'true');
  await pick(page, '[data-plan="Free"] button');
  await expect(channel(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true');

  // Leaving Element mode with something selected goes back to Notes.
  await pick(page, '[data-testid="signup"]');
  await expect(channel(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true');
  await setMode(page, 'Highlight');
  await expect(channel(page, 'Notes')).toHaveAttribute('aria-pressed', 'true');
});

test('selecting an element never opens a closed drawer', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await expect(panel(page)).toBeHidden();

  await pick(page, '[data-testid="signup"]');
  await expect(panel(page)).toBeHidden();

  await openPanel(page);
  await expect(channel(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true');
});

test('the canvas reads like devtools: bands over the element, the numbers in the card', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');

  await pointAt(page, '[data-testid="signup"]');
  const bands = overlay(page).locator('.box-model');
  await expect(bands).toHaveCount(1);
  // Content, padding and border; the button has no margin.
  await expect(bands.locator('rect')).toHaveCount(1);
  await expect(bands.locator('path')).toHaveCount(2);
  await expect(overlay(page).locator('.box-num')).toHaveCount(0);

  await expect(overlay(page).locator('.element-card')).toContainText('8px 16px');
  await expect(overlay(page).locator('.element-card .size')).toHaveText(/\d+ × \d+/);

  // Devtools draws the bands whatever the size; only the numbers needed the room.
  await pointAt(page, '[data-testid="accent-teal"]');
  await expect(overlay(page).locator('.box-model')).toHaveCount(1);
});

test('the CSS details switch takes the box model off the canvas', async ({ page, site }) => {
  await page.goto(`${site}/`);
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'CSS details' }).click();
  await page.keyboard.press('Escape');

  await setMode(page, 'Element');
  await pointAt(page, '[data-testid="signup"]');
  await expect(overlay(page).locator('.box-model')).toHaveCount(0);
  await expect(overlay(page).locator('.element-card')).toHaveCount(0);
  await expect(overlay(page).locator('.label-chip')).toBeVisible();

  const again = await openSettings(page);
  await again.getByRole('switch', { name: 'CSS details' }).click();
  await page.keyboard.press('Escape');
  await pointAt(page, '[data-testid="signup"]');
  await expect(overlay(page).locator('.box-model')).toHaveCount(1);
  await expect(overlay(page).locator('.element-card')).toBeVisible();
});

test('the panel shows what the source declares, and a change goes into the note', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);
  await pick(page, '[data-testid="signup"]');

  // As written in the stylesheet, tokens and all — not the computed pixels.
  await expect(panel(page).locator('input[aria-label="padding"]')).toHaveValue(
    'var(--demo-space-2) var(--demo-space-4)',
  );
  await expect(panel(page).locator('input[aria-label="border-radius"]')).toHaveValue(
    'var(--demo-radius-md)',
  );
  // Inherited from body, and marked as such.
  await expect(panel(page).locator('.editor.inherited input[aria-label="font-size"]')).toHaveValue(
    'var(--demo-text-base)',
  );

  const padding = panel(page).locator('input[aria-label="padding"]');
  await padding.fill('24px 40px');
  await padding.blur();

  // The page itself shows the proposal, from a stylesheet the overlay owns.
  await expect
    .poll(() => page.locator('[data-testid="signup"]').evaluate((el) => getComputedStyle(el).padding))
    .toBe('24px 40px');

  const background = panel(page).locator('input[aria-label="background"]');
  // The token it already has changes nothing, and must not be recorded as a change.
  await background.fill('var(--demo-accent)');
  await background.blur();
  await expect(panel(page)).toContainText('1 CSS change');
  await background.fill('var(--demo-surface)');
  await background.blur();
  await expect(panel(page)).toContainText('2 CSS changes');

  await annotate(page, '[data-testid="signup"]');
  await expect(popup(page)).toContainText('2 CSS changes');
  await commit(page, 'roomier, and on the surface colour');

  const stored = (await storedAnnotations(annotDir, '/'))[0]!;
  expect(stored.styleEdits).toEqual([
    {
      selector: expect.stringContaining('signup'),
      property: 'padding',
      from: 'var(--demo-space-2) var(--demo-space-4)',
      to: '24px 40px',
      token: null,
      // The rule that holds the value today, so the agent edits that one.
      rule: { selector: '.btn', file: expect.stringContaining('src/utilities.css') },
    },
    {
      selector: expect.stringContaining('signup'),
      property: 'background',
      from: 'var(--demo-accent)',
      to: 'var(--demo-surface)',
      token: '--demo-surface',
      rule: { selector: '.btn-primary', file: expect.stringContaining('src/utilities.css') },
    },
  ]);

  // And where the element itself was written, straight from the dev build.
  const target = stored.target as ElementTarget;
  expect(target.elements[0]!.source?.file).toBe('src/Home.svelte');
  expect(target.elements[0]!.declared?.some((d) => d.property === 'padding' && d.from === '.btn')).toBe(
    true,
  );

  // Sent means done: the page goes back to what the code says.
  await expect
    .poll(() => page.locator('[data-testid="signup"]').evaluate((el) => getComputedStyle(el).padding))
    .toBe('8px 16px');
});

test('CSS changes go out on their own, with no note written', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);
  await pick(page, '[data-testid="signup"]');

  const padding = panel(page).locator('input[aria-label="padding"]');
  await padding.fill('var(--demo-space-5)');
  await padding.blur();
  await panel(page).getByRole('button', { name: 'Send', exact: true }).click();

  // No popup, no comment typed: the values are the whole message.
  await expect(popup(page)).toHaveCount(0);
  await expect(overlay(page).locator('.toast')).toContainText('Sent. Waiting for the agent.');

  const stored = (await storedAnnotations(annotDir, '/'))[0]!;
  expect(stored.status).toBe('sent');
  expect(stored.comment).toBe('CSS: padding');
  expect(stored.styleEdits?.[0]?.to).toBe('var(--demo-space-5)');

  // Sent means done: the pending bar is empty and the page is back to what the code says.
  await expect(panel(page).getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
  await expect
    .poll(() => page.locator('[data-testid="signup"]').evaluate((el) => getComputedStyle(el).padding))
    .toBe('8px 16px');
});

test('a property the source never set is added as an override, and taken back off', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);
  await pick(page, '[data-testid="signup"]');

  const inline = panel(page).locator('.editor.added input[aria-label="padding-inline"]');
  await expect(inline).toHaveCount(0);

  await panel(page).getByRole('button', { name: 'Add a property' }).click();
  await panel(page).getByRole('button', { name: 'padding-inline', exact: true }).click();
  const inlineValue = panel(page).locator('input[aria-label="padding-inline"]');
  await inlineValue.fill('var(--demo-space-5)');
  await inlineValue.blur();

  // Horizontal only: the vertical padding is untouched.
  await expect
    .poll(() => page.locator('[data-testid="signup"]').evaluate((el) => getComputedStyle(el).padding))
    .toBe('8px 24px');

  await panel(page).getByRole('button', { name: 'Remove padding-inline' }).click();
  await expect(inline).toHaveCount(0);
  await expect
    .poll(() => page.locator('[data-testid="signup"]').evaluate((el) => getComputedStyle(el).padding))
    .toBe('8px 16px');
});

/** Click the gap between the first two children, which is the container and not a child. */
async function clickGap(page: Page, testid: string): Promise<void> {
  const at = await page.locator(`[data-testid="${testid}"]`).evaluate((el) => {
    // Measured after the scroll, in the same turn, so the point is where the gap actually is.
    el.scrollIntoView({ block: 'center' });
    const a = el.children[0]!.getBoundingClientRect();
    const b = el.children[1]!.getBoundingClientRect();
    const across = b.x > a.right;
    return {
      x: across ? (a.right + b.x) / 2 : a.x + 5,
      y: across ? a.y + 5 : (a.bottom + b.y) / 2,
    };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
}

test('picking stops when you pick, and C starts it again', async ({ page, site }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);

  await pointAt(page, '[data-testid="signup"]');
  await expect(overlay(page).locator('.element-card')).toBeVisible();

  // Picking an element leaves the picker, the way devtools does.
  await clickHost(page, '[data-testid="signup"]');
  await expect(overlay(page).locator('.element-card')).toHaveCount(0);
  await pointAt(page, '[data-plan="Pro"] button');
  await expect(overlay(page).locator('.element-card')).toHaveCount(0);
  await expect(panel(page).locator('.inspect .sel')).toContainText('signup');

  // The picker lives in the inspect bar, with its key on it.
  const picker = panel(page).getByRole('button', { name: 'Point at elements' });
  await expect(picker).toHaveAttribute('aria-pressed', 'false');
  await picker.click();
  await expect(picker).toHaveAttribute('aria-pressed', 'true');
  await pointAt(page, '[data-plan="Pro"] button');
  await expect(overlay(page).locator('.element-card')).toBeVisible();

  await page.keyboard.press('c');
  await expect(picker).toHaveAttribute('aria-pressed', 'false');
});

test('what the agent gets is the code, with the proposal beside it', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/layout/`);
  await setMode(page, 'Element');
  await openPanel(page);
  await clickGap(page, 'card-grid');

  const gap = panel(page).locator('input[aria-label="gap"]');
  await expect(gap).toHaveValue('var(--demo-space-5)');
  await gap.fill('var(--demo-space-7)');
  await gap.blur();
  await expect
    .poll(() => page.locator('[data-testid="card-grid"]').evaluate((el) => getComputedStyle(el).gap))
    .toBe('40px');

  // The change is what the agent is shown first; the styles under it keep the code's value.
  await expect(panel(page).locator('.decls.payload').first()).toContainText(
    'var(--demo-space-5) → var(--demo-space-7)',
  );
  await expect(panel(page).locator('.decls.payload').last()).toContainText('24px');

  await annotate(page, '[data-testid="card-grid"]');
  await commit(page, 'more air between the cards');
  const stored = (await storedAnnotations(annotDir, '/layout/'))[0]!;
  const target = stored.target as ElementTarget;
  expect(target.elements[0]!.styles?.['gap']).toBe('24px');
  expect(stored.styleEdits?.[0]?.to).toBe('var(--demo-space-7)');
});

test('a gap is read back as the stylesheet wrote it, on every kind of container', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/layout/`);
  await setMode(page, 'Element');
  await openPanel(page);

  await clickGap(page, 'split-grid');
  await expect(panel(page).locator('input[aria-label="row-gap"]')).toHaveValue(
    'var(--demo-space-3)',
  );
  await expect(panel(page).locator('input[aria-label="column-gap"]')).toHaveValue(
    'var(--demo-space-7)',
  );

  // One shorthand holding both axes, and the token beside a gap written in rem.
  await clickGap(page, 'wrap-shelf');
  await expect(panel(page).locator('input[aria-label="gap"]')).toHaveValue(
    'var(--demo-space-2) var(--demo-space-6)',
  );
  await clickGap(page, 'row-gap-rem');
  await expect(panel(page).locator('input[aria-label="gap"]')).toHaveValue('1rem');
  await expect(panel(page).locator('.editor .token')).toHaveText('--demo-space-4');
});

test('what the inspector shows is what the annotation carries', async ({ page, site, annotDir }) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await openPanel(page);

  await pick(page, '[data-testid="signup"]');
  const shown = await payload(page);
  expect(Object.keys(shown).length).toBeGreaterThan(3);
  const tokens = await panel(page).locator('.token').allTextContents();
  expect(tokens).toContain('--demo-accent');

  await annotate(page, '[data-testid="signup"]');
  await commit(page, 'make this say Start free');
  await sendBatch(page);

  const target = (await storedAnnotations(annotDir, '/'))[0]!.target as ElementTarget;
  const stored = Object.fromEntries(
    Object.entries(target.elements[0]!.styles ?? {}).map(([k, v]) => [k, v.replace(/\s+/g, ' ')]),
  );
  expect(shown).toEqual(stored);
  expect(Object.keys(shown)).toEqual(Object.keys(stored));
});

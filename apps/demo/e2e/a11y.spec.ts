import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
  clickHost,
  openPanel,
  popup,
  ready,
  setMode,
} from './overlay.js';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[] }[];
}

async function scanOverlay(
  page: Page,
): Promise<{ serious: Violation[]; checked: number }> {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    const axe = (window as never as { axe: { run: (o: unknown) => Promise<unknown> } }).axe;
    return (await axe.run({ include: [['annot-overlay']] })) as {
      violations: Violation[];
      passes: { nodes: unknown[] }[];
    };
  });
  return {
    serious: result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    checked: result.passes.reduce((n, p) => n + p.nodes.length, 0),
  };
}

test('the overlay has no serious axe violations with the popup and panel open', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/`);
  await ready(page);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'this button needs a clearer label');
  await openPanel(page);
  await clickHost(page, 'article[data-plan="Pro"]');
  await expect(popup(page)).toBeVisible();

  const { serious, checked } = await scanOverlay(page);
  expect(checked, 'axe reached the overlay through its shadow root').toBeGreaterThan(10);
  expect(
    serious.map((v) => `${v.id} (${v.impact}) ${v.help}`),
    'serious or critical axe violations in the overlay',
  ).toEqual([]);
});

test('every overlay control carries a name, and the markers announce their status', async ({
  page,
  site,
}) => {
  await page.goto(`${site}/`);
  await ready(page);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'a draft');

  const nameless = await page.locator('annot-overlay').evaluate((host) => {
    const root = (host as HTMLElement).shadowRoot!;
    return [...root.querySelectorAll('button, input, textarea, select')]
      .filter((el) => {
        const label = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
        return label === '';
      })
      .map((el) => el.outerHTML.slice(0, 80));
  });
  expect(nameless).toEqual([]);

  await expect(page.locator('annot-overlay').locator('.marker')).toHaveAttribute(
    'aria-label',
    'Annotation 1, draft',
  );
});

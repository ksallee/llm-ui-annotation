import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
  annotate,
  dropFile,
  openPanel,
  panel,
  PNG_FILE,
  ready,
  setMode,
} from './overlay.js';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}

/** One line per offending node: a rule name alone does not say what to fix. */
const describe = (v: Violation): string[] =>
  v.nodes.map(
    (n) =>
      `${v.id} (${v.impact}) ${JSON.stringify(n.target)} — ${(n.failureSummary ?? v.help)
        .replace(/\s+/g, ' ')
        .slice(0, 160)}`,
  );

/**
 * Wait until every overlay surface has finished its enter transition. axe composites whatever is
 * behind a half-faded card, so scanning mid-animation reports contrast against a blend of the page.
 */
async function settled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector('annot-overlay')?.shadowRoot;
        if (!root) return false;
        const surfaces = [...root.querySelectorAll('.popup, .panel, .card, .toast')];
        return surfaces.every((el) => getComputedStyle(el).opacity === '1');
      }),
    )
    .toBe(true);
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
  const row = panel(page).locator('.entry').first();
  await dropFile(page, row, 'mock-v2.png', 'image/png', PNG_FILE);
  await expect(row.locator('.attachment .att-name')).toHaveText('mock-v2.png');
  await annotate(page, 'article[data-plan="Pro"]');

  await settled(page);
  const { serious, checked } = await scanOverlay(page);
  expect(checked, 'axe reached the overlay through its shadow root').toBeGreaterThan(10);
  expect(serious.flatMap(describe), 'serious or critical axe violations in the overlay').toEqual([]);
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

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import {
  annotateElement,
  clickHost,
  commit,
  dropFile,
  openPanel,
  panel,
  PNG_FILE as PNG,
  popup,
  setMode,
  snapshot,
  storedAnnotations,
} from './overlay.js';

const PDF = 'JVBERi0xLjQgYnJhbmQgc3BlYw==';
/** A zip header followed by bytes no accepted format decodes to. */
const ZIP = 'UEsDBP/+';

const row = (page: Page, n: number): Locator =>
  panel(page).locator('.entry', { has: page.locator(`text="#${n}"`) }).first();

async function storedFiles(dir: string, annotationId: string): Promise<string[]> {
  return readdir(join(dir, 'attachments', annotationId)).catch(() => [] as string[]);
}

test('a PNG dropped on the popup reaches disk and stays on the note', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await clickHost(page, '[data-testid="signup"]');

  const card = popup(page);
  await expect(card).toBeVisible();
  await dropFile(page, card, 'mock-v2.png', 'image/png', PNG);
  await expect(card.locator('.attachment .att-name')).toHaveText('mock-v2.png');

  await commit(page, 'Make it look like this');
  await openPanel(page);
  await expect(row(page, 1).locator('.attachment .att-name')).toHaveText('mock-v2.png');

  const [annotation] = await storedAnnotations(annotDir, '/');
  expect(annotation!.comment).toBe('Make it look like this');
  // The early draft carries the comment once, not twice: it is created with an empty thread.
  expect(annotation!.thread).toHaveLength(1);
  const [attachment] = annotation!.attachments ?? [];
  expect(attachment).toMatchObject({ name: 'mock-v2.png', type: 'image/png' });
  expect(await storedFiles(annotDir, annotation!.id)).toEqual([`${attachment!.id}.png`]);
});

test('a file dropped on a panel row attaches to that annotation', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'match the brand spec');
  await openPanel(page);

  await dropFile(page, row(page, 1), 'brand-spec.pdf', 'application/pdf', PDF);
  await expect(row(page, 1).locator('.attachment .att-name')).toHaveText('brand-spec.pdf');

  const [annotation] = await storedAnnotations(annotDir, '/');
  const [attachment] = annotation!.attachments ?? [];
  expect(attachment).toMatchObject({ name: 'brand-spec.pdf', type: 'application/pdf' });
  expect(await storedFiles(annotDir, annotation!.id)).toEqual([`${attachment!.id}.pdf`]);

  await row(page, 1).getByRole('button', { name: 'Remove brand-spec.pdf' }).click();
  await expect(row(page, 1).locator('.attachment')).toHaveCount(0);
  await expect.poll(() => storedFiles(annotDir, annotation!.id)).toEqual([]);
});

test('a rejected type says what is accepted and stores nothing', async ({
  page,
  site,
  annotDir,
}) => {
  await page.goto(`${site}/`);
  await setMode(page, 'Element');
  await annotateElement(page, '[data-testid="signup"]', 'the mock is attached');
  await openPanel(page);

  await dropFile(page, row(page, 1), 'mock.zip', 'application/zip', ZIP);

  await expect
    .poll(() => snapshot(page).then((s) => s.toasts.join(' ')))
    .toMatch(/mock\.zip: unsupported type — accepted: image\/png/);
  await expect(row(page, 1).locator('.attachment')).toHaveCount(0);

  const [annotation] = await storedAnnotations(annotDir, '/');
  expect(annotation!.attachments ?? []).toEqual([]);
});

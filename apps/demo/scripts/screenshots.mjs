#!/usr/bin/env node
// Re-shoot the two README stills: the popup mid-annotation, and the panel after the agent replied.
//
//   node scripts/screenshots.mjs

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs');
const dir = mkdtempSync(resolve(tmpdir(), 'annot-shots-'));
process.env['ANNOT_DIR'] = dir;
mkdirSync(out, { recursive: true });

const server = await createServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');

const agent = spawn(process.execPath, [resolve(root, 'scripts/fake-agent.mjs'), '--quiet'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, ANNOT_AGENT: 'shots', ANNOT_COLLECT_MS: '150' },
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 2 });
const shadow = (s) => page.locator('annot-overlay').locator(s);
const ready = () =>
  page.waitForFunction(() => document.querySelector('annot-overlay')?.state?.ready === true);
const centre = async (s) => {
  const target = page.locator(s).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const annotate = async (selector, comment) => {
  const at = await centre(selector);
  await page.mouse.click(at.x, at.y);
  await shadow('.card.popup textarea.field').fill(comment);
};
// The popup re-places itself as it measures, so commit with the keyboard rather than a click.
const add = async () => {
  await page.keyboard.press('ControlOrMeta+Enter');
  await shadow('.card.popup').waitFor({ state: 'detached' });
};

await page.goto(`${origin}/`);
await ready();
await shadow('[aria-label="Open the annotation toolbar"]').click();
await shadow('[aria-label="Element mode"]').click();

await annotate('[data-testid="signup"]', 'Make this say “Start free” and drop the border radius.');
await page.screenshot({ path: resolve(out, 'annotating.png') });
await add();

await annotate('article[data-plan="Team"]', 'ask: should Team show the annual price instead?');
await add();
await annotate('#features-heading', 'Tighten the space above this heading.');
await add();

await shadow('button.send-btn').click();
await shadow('[aria-label="Send annotations"] textarea.field').fill('Three things on the home page');
await shadow('[aria-label="Send annotations"] button.primary').click();

await page.waitForFunction(
  () => {
    const list = [...document.querySelector('annot-overlay').state.annotations.values()];
    return list.length === 3 && list.every((a) => a.status === 'review' || a.status === 'question');
  },
  undefined,
  { timeout: 60_000 },
);
await shadow('[aria-label="Toggle the annotations panel"]').click();
await shadow('[aria-label="Annotations"] .entry button.head').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(out, 'review.png') });

await browser.close();
agent.kill('SIGTERM');
await server.close();
rmSync(dir, { recursive: true, force: true });
console.log(`wrote ${out}/annotating.png and ${out}/review.png`);

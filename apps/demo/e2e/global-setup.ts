import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';
import { createServer } from 'vite';
import { demoConfig } from '../vite.config.js';
import { cacheDir } from './cache.js';

const PAGES = ['/', '/app/', '/prose/', '/hostile/'];

/**
 * Warm one dependency cache and copy it to every worker's, so no test pays for the optimizer and
 * no page reloads mid-run.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const first = cacheDir(0);
  const dir = await mkdtemp(join(tmpdir(), 'annot-warmup-'));
  const server = await createServer({
    ...demoConfig(dir),
    cacheDir: first,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  try {
    await server.listen();
    const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
    if (!origin) throw new Error('the warm-up server did not report a URL');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const path of PAGES) {
      await page.goto(origin + path);
      await page.waitForFunction(() => {
        const el = document.querySelector('annot-overlay') as { state?: { ready?: boolean } } | null;
        return el?.state?.ready === true;
      });
    }
    await browser.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }

  for (let i = 1; i < config.workers; i++) {
    await rm(cacheDir(i), { recursive: true, force: true });
    await cp(first, cacheDir(i), { recursive: true });
  }
}

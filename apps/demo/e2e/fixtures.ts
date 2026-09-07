import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test as base } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { demoConfig, root } from '../vite.config.js';
import { cacheDir } from './cache.js';

export interface Agent {
  /** Start the scripted agent against this test's storage. */
  start(): void;
}

export interface Fixtures {
  /** This test's `.annotations` directory. */
  annotDir: string;
  /** Origin of this test's dev server, e.g. `http://127.0.0.1:53411`. */
  site: string;
  agent: Agent;
}

/** A write that landed after the server closed leaves the directory non-empty; take the second pass. */
async function removeDir(dir: string, tries = 5): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 50));
    }
  }
}

export const test = base.extend<Fixtures>({
  // ANNOT_E2E_NOISE=1 prints what the browser complained about, which is how a broken module graph
  // shows up: the overlay simply never mounts.
  page: async ({ page }, use) => {
    const noise: string[] = [];
    if (process.env['ANNOT_E2E_NOISE']) {
      page.on('console', (m) => m.type() === 'error' && noise.push(m.text()));
      page.on('pageerror', (e) => noise.push(String(e)));
      page.on('response', (r) => r.status() >= 400 && noise.push(`${r.status()} ${r.url()}`));
    }
    await use(page);
    if (noise.length > 0) process.stderr.write(`\n[browser] ${noise.join('\n[browser] ')}\n`);
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern
  annotDir: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), 'annot-e2e-'));
    await use(dir);
    await removeDir(dir);
  },

  site: async ({ annotDir }, use) => {
    let server: ViteDevServer | null = null;
    try {
      server = await createServer({
        ...demoConfig(annotDir),
        cacheDir: cacheDir(),
        configFile: false,
        logLevel: 'error',
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      await server.listen();
      const url = server.resolvedUrls?.local[0];
      if (!url) throw new Error('the dev server did not report a URL');
      await use(url.replace(/\/$/, ''));
    } finally {
      await server?.close();
    }
  },

  agent: async ({ annotDir }, use) => {
    let child: ChildProcess | undefined;
    const start = (): void => {
      child ??= spawn(
        process.execPath,
        [resolve(root, 'scripts/fake-agent.mjs'), '--timeout', '20', '--quiet'],
        {
          cwd: root,
          stdio: 'ignore',
          env: { ...process.env, ANNOT_DIR: annotDir, ANNOT_AGENT: 'e2e', ANNOT_COLLECT_MS: '150' },
        },
      );
    };
    await use({ start });
    child?.kill('SIGTERM');
  },
});

export { expect } from '@playwright/test';

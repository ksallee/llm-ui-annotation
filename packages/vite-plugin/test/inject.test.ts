import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { annotations } from '../src/index.js';
import { HTML, startHarness, tempRoot, type Harness } from './helpers.js';

const SCRIPT = '<script type="module" src="/@id/__x00__virtual:annot-auto"></script>';

let harnesses: Harness[] = [];

const serve = async (...args: Parameters<typeof startHarness>): Promise<Harness> => {
  const h = await startHarness(...args);
  harnesses.push(h);
  return h;
};

afterEach(async () => {
  const open = harnesses;
  harnesses = [];
  await Promise.all(open.map((h) => h.close()));
});

describe('transformIndexHtml', () => {
  it('injects the overlay script in serve', async () => {
    const h = await serve();
    const html = await (await h.raw('/')).text();
    expect(html).toContain(SCRIPT);
  });

  it('does not inject in build output', async () => {
    const root = await tempRoot('annot-build-');
    try {
      await writeFile(join(root, 'index.html'), HTML);
      await build({
        root,
        configFile: false,
        logLevel: 'silent',
        build: { outDir: 'dist', emptyOutDir: true },
        plugins: [annotations({ dir: join(root, '.annotations') })],
      });
      const html = await readFile(join(root, 'dist', 'index.html'), 'utf8');
      expect(html).not.toContain('annot-auto');
      expect(html).not.toContain('__ANNOT_OPTIONS__');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('honours inject: false', async () => {
    const h = await serve({ inject: false });
    expect(await (await h.raw('/')).text()).not.toContain('annot-auto');
  });

  it('honours the include globs', async () => {
    const h = await serve({ include: ['/only/*.html'] });
    expect(await (await h.raw('/')).text()).not.toContain('annot-auto');
  });

  it('serves a virtual module that carries the overlay options', async () => {
    const h = await serve({ accent: '#2C8A85', scheme: 'dark' });
    const source = await (await h.raw('/@id/__x00__virtual:annot-auto')).text();
    expect(source).toContain('__ANNOT_OPTIONS__');
    expect(source).toContain('"accent":"#2C8A85"');
    expect(source).toContain('"scheme":"dark"');
    expect(source).toContain('"basePath":"/__annot"');
    // TODO(ws-04): once @llm-ui-annotation/svelte/auto exists the module imports it instead of warning.
    expect(source).toMatch(/@llm-ui-annotation\/svelte\/auto/);
  });
});

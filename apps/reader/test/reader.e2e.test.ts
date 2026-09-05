import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { routeFile, type RouteFile } from '@llm-ui-annotation/core';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { READER, REPO } from './support/build.js';
import { startReader, type DevServer } from './support/server.js';

const CLI = resolve(REPO, 'packages/cli/dist/bin.js');
const FIXTURE = resolve(READER, 'test/fixtures/essai.md');
const ROUTE = '/doc/essai.md';
const BLOCK = 'opening/2';
const QUOTE = 'never in the middle of the room';
const INSERTED = 'An inserted paragraph, to push the quote down the section.';

interface OverlayState {
  ready: boolean;
  mode: string | null;
  route: string;
  textChip: { enabled: boolean; reason: string; target: unknown } | null;
  visible: { id: string }[];
  annotations: Map<string, { status: string }>;
  add(mode: string, target: unknown, comment: string): Promise<{ id: string }>;
  anchorOf(id: string): { state: string; rects: unknown[] } | null;
  approve(id: string): Promise<void>;
  reanchor(): void;
}

interface Snapshot {
  status: string | null;
  anchor: string | null;
  rects: number;
  painted: number;
  visible: number;
}

let dir = '';
let doc = '';
let annotDir = '';
let server: DevServer;
let browser: Browser;
let page: Page;
let id = '';

const routeJson = (): RouteFile =>
  JSON.parse(readFileSync(join(annotDir, routeFile(ROUTE)), 'utf8')) as RouteFile;

async function until<T>(what: string, fn: () => Promise<T | null>, ms = 30_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

const snapshot = (annotationId: string): Promise<Snapshot> =>
  page.evaluate((target: string) => {
    const overlay = document.querySelector('annot-overlay') as unknown as { state: OverlayState };
    const state = overlay.state;
    state.reanchor();
    const anchor = state.anchorOf(target);
    const highlights = (CSS as unknown as { highlights: Map<string, { size: number }> }).highlights;
    let painted = 0;
    for (const name of ['annot-sent', 'annot-acknowledged', 'annot-review']) {
      painted += highlights.get(name)?.size ?? 0;
    }
    return {
      status: state.annotations.get(target)?.status ?? null,
      anchor: anchor?.state ?? null,
      rects: anchor?.rects.length ?? 0,
      painted,
      visible: state.visible.length,
    };
  }, annotationId);

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'reader-e2e-'));
  doc = join(dir, 'essai.md');
  annotDir = join(dir, '.annotations');
  writeFileSync(doc, readFileSync(FIXTURE, 'utf8'));

  server = await startReader(doc);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });

  await until('the overlay', async () =>
    page.evaluate(() => {
      const overlay = document.querySelector('annot-overlay') as unknown as {
        state?: OverlayState;
      } | null;
      const state = overlay?.state;
      return state?.ready && document.querySelector('[data-annot-block]') ? state.route : null;
    }),
  );
});

afterAll(async () => {
  await browser?.close();
  server?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('reader end to end', () => {
  it('mounts the overlay in text mode on /doc/<basename>', async () => {
    const info = await page.evaluate(() => {
      const overlay = document.querySelector('annot-overlay') as unknown as { state: OverlayState };
      return { route: overlay.state.route, mode: overlay.state.mode };
    });
    expect(info).toEqual({ route: ROUTE, mode: 'text' });
  });

  it('annotates a selection and stores a data-annot-block text target', async () => {
    id = await page.evaluate(
      async ({ block, quote, comment }) => {
        const el = document.querySelector(`[data-annot-block="${block}"]`);
        const node = [...(el?.childNodes ?? [])].find(
          (n): n is Text => n.nodeType === 3 && (n as Text).data.includes(quote),
        );
        if (!node) throw new Error(`no text node with the quote in ${block}`);
        const at = node.data.indexOf(quote);
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + quote.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));

        const state = (document.querySelector('annot-overlay') as unknown as { state: OverlayState })
          .state;
        for (let i = 0; i < 80 && !state.textChip?.enabled; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!state.textChip?.enabled) throw new Error(`no text chip: ${String(state.textChip?.reason)}`);
        const saved = await state.add('text', state.textChip.target, comment);
        return saved.id;
      },
      { block: BLOCK, quote: QUOTE, comment: 'Shorten this sentence.' },
    );

    const annotation = await until('the route file', async () => {
      try {
        const saved = routeJson().annotations.find((a) => a.id === id);
        return saved?.batch ? saved : null;
      } catch {
        return null;
      }
    });

    expect(annotation.mode).toBe('text');
    expect(annotation.status).toBe('sent');
    expect(annotation.target.kind).toBe('text');
    if (annotation.target.kind !== 'text') throw new Error('not a text target');
    expect(annotation.target.container.selector).toBe(`[data-annot-block="${BLOCK}"]`);
    expect(annotation.target.quote).toBe(QUOTE);
  });

  it('draws the highlight', async () => {
    const shot = await snapshot(id);
    expect(shot.anchor).toBe('exact');
    expect(shot.rects).toBeGreaterThan(0);
    expect(shot.painted).toBeGreaterThan(0);
  });

  it('re-anchors as moved when a paragraph is inserted above the quote', async () => {
    const original = readFileSync(FIXTURE, 'utf8');
    writeFileSync(doc, original.replace('Light falls', `${INSERTED}\n\nLight falls`));
    await until('the inserted paragraph', async () =>
      page.evaluate(
        (block: string) =>
          document.querySelector(`[data-annot-block="${block}"]`)?.textContent?.trim() ?? null,
        BLOCK,
      ).then((text) => (text === INSERTED ? text : null)),
    );
    const shot = await snapshot(id);
    expect(shot.anchor).toBe('moved');
    expect(shot.painted).toBeGreaterThan(0);
  });

  it('is exact again once the document is restored', async () => {
    writeFileSync(doc, readFileSync(FIXTURE, 'utf8'));
    await until('the restored paragraph', async () =>
      page.evaluate(
        (block: string) =>
          document.querySelector(`[data-annot-block="${block}"]`)?.textContent?.trim() ?? null,
        BLOCK,
      ).then((text) => (text?.startsWith('Light falls') ? text : null)),
    );
    expect((await snapshot(id)).anchor).toBe('exact');
  });

  it('goes to review when the agent runs annot done', async () => {
    const out = execFileSync('node', [CLI, 'done', id, '--summary', 'Cut the sentence in two.'], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, ANNOT_DIR: annotDir },
    });
    expect(out).toMatch(/review/i);
    await until('review in the browser', async () =>
      (await snapshot(id)).status === 'review' ? true : null,
    );
  });

  it('drops the highlight once the user approves', async () => {
    await page.evaluate((target: string) => {
      const overlay = document.querySelector('annot-overlay') as unknown as { state: OverlayState };
      return overlay.state.approve(target);
    }, id);

    const shot = await until('the approval', async () => {
      const next = await snapshot(id);
      return next.status === 'approved' ? next : null;
    });
    expect(shot.anchor).toBeNull();
    expect(shot.painted).toBe(0);
    expect(shot.visible).toBe(0);
    expect(routeJson().annotations.find((a) => a.id === id)?.status).toBe('approved');
  });
});

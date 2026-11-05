import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseEvents,
  slug,
  type Annotation,
  type HealthResponse,
  type ReplaceRequest,
  type RouteFile,
  type TextTarget,
} from '@llm-ui-annotation/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './helpers.js';

const ROUTE = '/doc/a.md';
const DOC = '# Title\n\nThe file on\ndisk is the source of truth; the page is a view of it.\n';
const JSON_POST = { method: 'POST', headers: { 'content-type': 'application/json' } };

const target: TextTarget = {
  kind: 'text',
  container: {
    selector: '[data-annot-block="epigraph/0"]',
    fallbacks: [],
    tag: 'p',
    role: null,
    name: '',
    text: '',
    rect: { x: 0, y: 0, width: 10, height: 10 },
    fixed: false,
    attrs: {},
  },
  quote: 'source of truth',
  prefix: 'The file on disk is the ',
  suffix: '; the page is a view of it.',
  start: 24,
  end: 39,
  rects: [],
};

const request = (over: Partial<ReplaceRequest> = {}): ReplaceRequest => ({
  route: ROUTE,
  url: `http://localhost${ROUTE}`,
  target,
  replacement: 'single source of truth',
  viewport: { width: 1280, height: 900, dpr: 1, scrollX: 0, scrollY: 0 },
  ...over,
});

let h: Harness;

beforeEach(async () => {
  h = await startHarness({ sourceFile: (route) => (route === ROUTE ? 'a.md' : undefined) }, { 'a.md': DOC });
});

afterEach(async () => {
  await h.close();
});

const replace = (body: unknown): Promise<Response> =>
  h.raw('/__annot/replace', { ...JSON_POST, body: JSON.stringify(body) });

describe('POST /replace', () => {
  it('says in /health that it can replace', async () => {
    expect((await h.api<HealthResponse>('/__annot/health')).replace).toBe(true);
  });

  it('writes the replacement into the source and records an approved replace annotation', async () => {
    const res = await replace(request());
    expect(res.status).toBe(201);
    const saved = (await res.json()) as Annotation;

    expect(await readFile(join(h.root, 'a.md'), 'utf8')).toBe(DOC.replace('source of truth', 'single source of truth'));
    expect(saved).toMatchObject({
      kind: 'replace',
      status: 'approved',
      mode: 'text',
      route: ROUTE,
      number: 1,
      replacement: { text: 'single source of truth', file: 'a.md' },
    });
    expect(saved.approvedAt).not.toBeNull();
    expect(saved.thread[0]).toMatchObject({ role: 'user', kind: 'comment' });

    const file = await h.api<RouteFile>(`/__annot/routes/${slug(ROUTE)}`);
    expect(file.annotations.map((a) => a.id)).toEqual([saved.id]);
    const events = parseEvents(await readFile(join(h.dir, 'events.jsonl'), 'utf8'));
    expect(events.at(-1)).toMatchObject({ type: 'annotation.created', by: 'user', annotationId: saved.id });
  });

  it('refuses with 409 and leaves the file alone when it has drifted', async () => {
    const drifted = DOC.replace('source of truth', 'origin of truth');
    await writeFile(join(h.root, 'a.md'), drifted);
    const res = await replace(request());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/changed since/);
    expect(await readFile(join(h.root, 'a.md'), 'utf8')).toBe(drifted);
    const file = await h.api<RouteFile>(`/__annot/routes/${slug(ROUTE)}`);
    expect(file.annotations).toEqual([]);
  });

  it('refuses a route with no source file', async () => {
    expect((await replace(request({ route: '/elsewhere' }))).status).toBe(404);
  });

  it('refuses a replacement that changes nothing, and a malformed target', async () => {
    expect((await replace(request({ replacement: 'source of truth' }))).status).toBe(400);
    expect((await replace(request({ target: { ...target, quote: 7 } as unknown as TextTarget }))).status).toBe(400);
  });

  it('refuses to reopen a user edit', async () => {
    const saved = (await (await replace(request())).json()) as Annotation;
    const res = await h.raw(`/__annot/annotations/${saved.id}/transition`, {
      ...JSON_POST,
      body: JSON.stringify({ to: 'sent', by: 'user', message: { kind: 'reopen', text: 'again', role: 'user' } }),
    });
    expect(res.status).toBe(409);
  });
});

describe('without a source file option', () => {
  it('does not offer replace', async () => {
    const plain = await startHarness();
    try {
      expect((await plain.api<HealthResponse>('/__annot/health')).replace).toBeUndefined();
      expect((await plain.raw('/__annot/replace', { ...JSON_POST, body: JSON.stringify(request()) })).status).toBe(404);
    } finally {
      await plain.close();
    }
  });
});

import { newId, nowIso, type Annotation, type Batch } from '@llm-ui-annotation/core';
import { readServerInfo } from '@llm-ui-annotation/core/node';
import { annotations } from '@llm-ui-annotation/vite-plugin';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { annot } from './helpers.js';

beforeAll(() => {
  process.env['ANNOT_COLLECT_MS'] = '250';
});

interface Live {
  dir: string;
  url: string;
  server: ViteDevServer;
  root: string;
}

let live: Live | null = null;

afterEach(async () => {
  if (live) {
    await live.server.close();
    await rm(live.root, { recursive: true, force: true });
  }
  live = null;
});

async function start(): Promise<Live> {
  const root = await mkdtemp(join(tmpdir(), 'annot-live-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><html><body></body></html>\n');
  const dir = join(root, '.annotations');
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
    plugins: [annotations({ dir, inject: false })],
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  live = { dir, root, server, url: `http://127.0.0.1:${port}/__annot` };
  for (let i = 0; i < 100 && (await readServerInfo(dir)) === null; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  return live;
}

function draft(route: string, comment: string): Annotation {
  const at = nowIso();
  return {
    id: newId(),
    protocolVersion: 1,
    route,
    url: `http://localhost${route}`,
    mode: 'element',
    target: {
      kind: 'element',
      elements: [
        {
          selector: 'main > button',
          fallbacks: ['button'],
          tag: 'button',
          role: 'button',
          name: 'Choose Pro',
          text: 'Choose Pro',
          rect: { x: 10, y: 20, width: 80, height: 30 },
          fixed: false,
          attrs: { type: 'submit' },
        },
      ],
    },
    comment,
    status: 'draft',
    thread: [{ id: newId(), role: 'user', kind: 'comment', text: comment, at }],
    batch: null,
    number: 0,
    viewport: { width: 1280, height: 900, dpr: 2, scrollX: 0, scrollY: 0 },
    createdAt: at,
    updatedAt: at,
    sentAt: null,
    resolvedAt: null,
    approvedAt: null,
    resolution: null,
  };
}

async function post<T>(url: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** What the overlay does: create a draft, then send it as a batch. */
async function send(url: string, route: string, comment: string): Promise<{ a: Annotation; batch: Batch }> {
  const a = await post<Annotation>(url, '/annotations', draft(route, comment));
  const batch = await post<Batch>(url, '/batches', {
    route,
    annotationIds: [a.id],
    summary: 'from the live plugin',
  });
  return { a, batch };
}

describe('against the real vite plugin', () => {
  it('prefers http and reads what the plugin wrote', async () => {
    const { dir, url } = await start();
    const { a } = await send(url, '/pricing', 'Make this the same height as the Free button.');
    expect(JSON.parse((await annot(dir, 'doctor', '--json')).out)).toMatchObject({ transport: 'http' });
    const pending = await annot(dir, 'pending');
    expect(pending.err).not.toContain('dev server not running');
    expect(pending.out).toContain('## /pricing');
    expect(pending.out).toContain(a.id);
  });

  it('runs the whole loop through the HTTP API', async () => {
    const { dir, url } = await start();
    const { a } = await send(url, '/pricing', 'Make this the same height as the Free button.');

    const watched = await annot(dir, 'watch', '--timeout', '5');
    expect(watched.code).toBe(0);
    expect(watched.out).toContain('## Feedback batch');
    expect(watched.out).toContain('Summary from the user: from the live plugin');
    expect(watched.out).toContain(a.id);

    expect((await annot(dir, 'ack', a.id)).out.trim()).toBe(`#${a.number} → acknowledged`);
    expect((await annot(dir, 'ask', a.id, 'Only Pro, or Free too?')).out.trim()).toBe(
      `#${a.number} → question`,
    );

    const answered = await post<Annotation>(url, `/annotations/${a.id}/transition`, {
      to: 'acknowledged',
      by: 'user',
      message: { role: 'user', kind: 'answer', text: 'Only Pro. Free stays 40px.' },
    });
    expect(answered.status).toBe('acknowledged');

    const answer = await annot(dir, 'watch', '--timeout', '5');
    expect(answer.out).toContain(`## Answer on #${a.number}`);
    expect(answer.out).toContain('A (user): Only Pro. Free stays 40px.');

    const done = await annot(dir, 'done', a.id, '--summary', 'Matched the Free button height.');
    expect(done.out.trim()).toBe(`#${a.number} → review (changed)`);

    const res = await fetch(`${url}/routes/__pricing`);
    const file = (await res.json()) as { annotations: Annotation[] };
    expect(file.annotations[0]?.resolution).toEqual({
      kind: 'changed',
      summary: 'Matched the Free button height.',
    });
  });

  it('wakes on a batch that the plugin sends while watch blocks', async () => {
    const { dir, url } = await start();
    const [res] = await Promise.all([
      annot(dir, 'watch', '--from-now', '--timeout', '10'),
      new Promise((r) => setTimeout(r, 250)).then(() => send(url, '/pricing', 'The gaps are uneven.')),
    ]);
    expect(res.code).toBe(0);
    expect(res.out).toContain('## Feedback batch');
    expect(res.out).toContain('> The gaps are uneven.');
  });

  it('exits 2 when the plugin rejects an illegal transition', async () => {
    const { dir, url } = await start();
    const { a } = await send(url, '/pricing', 'Make this taller.');
    await annot(dir, 'ack', a.id);
    expect((await annot(dir, 'ack', a.id)).code).toBe(2);
  });

  it('attaches a file over HTTP and reads it back in pending', async () => {
    const { dir, url } = await start();
    const { a } = await send(url, '/pricing', 'Make it look like this.');
    const png = join(live?.root ?? '', 'mock-v2.png');
    await writeFile(
      png,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    );

    const res = await annot(dir, 'attach', a.id, png);
    expect(res.code).toBe(0);
    expect(res.err).not.toContain('dev server not running');

    const file = (await (await fetch(`${url}/routes/__pricing`)).json()) as {
      annotations: Annotation[];
    };
    const attachment = file.annotations[0]?.attachments?.[0];
    expect(attachment).toMatchObject({ name: 'mock-v2.png', type: 'image/png', by: 'agent' });
    expect(await readFile(join(dir, attachment?.path ?? ''))).toHaveLength(70);
    expect((await annot(dir, 'pending')).out).toContain(
      `${join(dir, attachment?.path ?? '')}   mock-v2.png (image/png, 70 B)`,
    );
  });

  it('exits 124 when nothing happens', async () => {
    const { dir } = await start();
    const res = await annot(dir, 'watch', '--from-now', '--timeout', '1');
    expect(res.code).toBe(124);
    expect(res.out).toBe('');
  });
});

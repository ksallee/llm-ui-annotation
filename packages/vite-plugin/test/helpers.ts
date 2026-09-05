import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newId, nowIso, type Annotation, type Event, type Mode } from '@llm-ui-annotation/core';
import { createServer, type ViteDevServer } from 'vite';
import { annotations, type AnnotationsOptions } from '../src/index.js';

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export const tempRoot = async (prefix: string): Promise<string> =>
  realpath(await mkdtemp(join(tmpdir(), prefix)));

export const HTML = '<!doctype html>\n<html><head><title>host</title></head><body><h1>host</h1></body></html>\n';

export interface Harness {
  url: string;
  dir: string;
  root: string;
  server: ViteDevServer;
  warnings: string[];
  infos: string[];
  api<T>(path: string, init?: RequestInit): Promise<T>;
  raw(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

export async function startHarness(
  options: AnnotationsOptions = {},
  files: Record<string, string> = {},
): Promise<Harness> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'annot-vite-')));
  await writeFile(join(root, 'index.html'), HTML);
  for (const [name, content] of Object.entries(files)) await writeFile(join(root, name), content);
  const dir = options.dir ?? join(root, '.annotations');
  const warnings: string[] = [];
  const infos: string[] = [];

  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    customLogger: {
      info: (msg: string) => infos.push(msg),
      warn: (msg: string) => warnings.push(msg),
      warnOnce: (msg: string) => warnings.push(msg),
      error: () => undefined,
      clearScreen: () => undefined,
      hasErrorLogged: () => false,
      hasWarned: false,
    },
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    plugins: [annotations({ ...options, dir })],
  });
  await server.listen();

  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const url = `http://127.0.0.1:${port}`;

  const raw = (path: string, init?: RequestInit): Promise<Response> => fetch(`${url}${path}`, init);
  const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await raw(path, init);
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };

  return {
    url,
    dir,
    root,
    server,
    warnings,
    infos,
    api,
    raw,
    close: async () => {
      await server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  const at = nowIso();
  const id = overrides.id ?? newId();
  const mode: Mode = overrides.mode ?? 'element';
  return {
    id,
    protocolVersion: 1,
    route: '/pricing',
    url: 'http://localhost/pricing',
    mode,
    target: {
      kind: 'element',
      elements: [
        {
          selector: 'main > button',
          fallbacks: ['button'],
          tag: 'button',
          role: 'button',
          name: 'Save',
          text: 'Save',
          rect: { x: 10, y: 20, width: 80, height: 30 },
          fixed: false,
          attrs: { type: 'submit' },
        },
      ],
    },
    comment: 'Make this taller.',
    status: 'draft',
    thread: [{ id: newId(), role: 'user', kind: 'comment', text: 'Make this taller.', at }],
    batch: null,
    number: 0,
    viewport: { width: 1280, height: 900, dpr: 2, scrollX: 0, scrollY: 0 },
    createdAt: at,
    updatedAt: at,
    sentAt: null,
    resolvedAt: null,
    approvedAt: null,
    resolution: null,
    ...overrides,
  };
}

export function pageAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return makeAnnotation({
    mode: 'page',
    target: {
      kind: 'page',
      region: { x: 0, y: 0, width: 400, height: 300 },
      strokes: [{ tool: 'rect', rect: { x: 1, y: 2, width: 3, height: 4 }, color: '#f00', width: 2 }],
      screenshot: null,
      elements: [],
    },
    ...overrides,
  });
}

export interface SseReader {
  /** Resolves once the server has written its first bytes, so the subscription is live. */
  ready: Promise<void>;
  events: Promise<Event[]>;
}

/** Read an SSE stream until `count` events arrived or `ms` elapsed. */
export function readSse(url: string, count: number, ms = 5000): SseReader {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  let open!: () => void;
  const ready = new Promise<void>((resolve) => {
    open = resolve;
  });

  const events = (async (): Promise<Event[]> => {
    const collected: Event[] = [];
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { accept: 'text/event-stream' } });
      if (!res.body) throw new Error('no SSE body');
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        open();
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice(6))
            .join('\n');
          if (data !== '') collected.push(JSON.parse(data) as Event);
          if (collected.length >= count) return collected;
          boundary = buffer.indexOf('\n\n');
        }
      }
      return collected;
    } catch (err) {
      if (controller.signal.aborted) return collected;
      throw err;
    } finally {
      clearTimeout(timer);
      open();
      controller.abort();
    }
  })();

  return { ready, events };
}

/** Poll until `fn` is true, or throw. */
export async function until(fn: () => boolean | Promise<boolean>, ms = 5000, step = 20): Promise<void> {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, step));
  }
}

export const exists = async (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    () => false,
  );

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slug, type Annotation, type RouteFile } from '@llm-ui-annotation/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeAnnotation, readSse, startHarness, until, type Harness } from './helpers.js';

interface CustomMessage {
  type: string;
  event?: string;
  data?: unknown;
}

/** A client on Vite's HMR socket, collecting the plugin's custom events. */
async function connect(url: string): Promise<{ messages: CustomMessage[]; close: () => void }> {
  const socket = new WebSocket(url.replace('http://', 'ws://'), 'vite-hmr');
  const messages: CustomMessage[] = [];
  socket.addEventListener('message', (event) => {
    const parsed = JSON.parse(String(event.data)) as CustomMessage;
    if (parsed.type === 'custom') messages.push(parsed);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('ws failed')), { once: true });
  });
  return { messages, close: () => socket.close() };
}

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.close();
});

const post = <T>(path: string, body: unknown): Promise<T> =>
  h.api<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('websocket push', () => {
  it('sends annot:annotation on create and annot:deleted on delete', async () => {
    const client = await connect(h.url);
    try {
      const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
      await until(() => client.messages.some((m) => m.event === 'annot:annotation'));
      const pushed = client.messages.find((m) => m.event === 'annot:annotation');
      expect((pushed?.data as Annotation).id).toBe(created.id);

      await h.api(`/__annot/annotations/${created.id}`, { method: 'DELETE' });
      await until(() => client.messages.some((m) => m.event === 'annot:deleted'));
      expect(client.messages.find((m) => m.event === 'annot:deleted')?.data).toEqual({
        id: created.id,
        route: '/pricing',
      });
    } finally {
      client.close();
    }
  });

  it('sends annot:route when a batch moves a whole file', async () => {
    const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const client = await connect(h.url);
    try {
      await post('/__annot/batches', { route: '/pricing', annotationIds: [created.id], summary: null });
      await until(() => client.messages.some((m) => m.event === 'annot:route'));
      const file = client.messages.find((m) => m.event === 'annot:route')?.data as RouteFile;
      expect(file.annotations[0]?.status).toBe('sent');
    } finally {
      client.close();
    }
  });

  it('sends annot:route when another writer edits the route file', async () => {
    const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const client = await connect(h.url);
    try {
      const path = join(h.dir, 'routes', `${slug('/pricing')}.json`);
      const file = JSON.parse(await readFile(path, 'utf8')) as RouteFile;
      (file.annotations[0] as Annotation).comment = 'edited by the CLI';
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);

      await until(() => client.messages.some((m) => m.event === 'annot:route'), 8000);
      const pushed = client.messages.find((m) => m.event === 'annot:route')?.data as RouteFile;
      expect(pushed.annotations[0]?.comment).toBe('edited by the CLI');
      expect(pushed.annotations[0]?.id).toBe(created.id);
    } finally {
      client.close();
    }
  });

  it('forwards to a live SSE client the events another writer appended', async () => {
    await post<Annotation>('/__annot/annotations', makeAnnotation());
    const stream = readSse(`${h.url}/__annot/events/stream?since=1`, 1, 8000);
    await stream.ready;

    const log = join(h.dir, 'events.jsonl');
    const external = {
      seq: 2,
      at: new Date().toISOString(),
      type: 'status.changed',
      by: 'agent',
      route: '/pricing',
      status: 'acknowledged',
    };
    await writeFile(log, `${await readFile(log, 'utf8')}${JSON.stringify(external)}\n`);

    const events = await stream.events;
    expect(events).toEqual([external]);
  });
});

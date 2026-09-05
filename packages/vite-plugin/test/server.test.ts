import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseEvents,
  slug,
  type Annotation,
  type Batch,
  type Event,
  type HealthResponse,
  type RouteFile,
  type RoutesResponse,
  type ScreenshotResponse,
  type ServerInfo,
} from '@llm-ui-annotation/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readSse,
  exists,
  makeAnnotation,
  pageAnnotation,
  PNG,
  startHarness,
  until,
  type Harness,
} from './helpers.js';

const JSON_POST = { method: 'POST', headers: { 'content-type': 'application/json' } };

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.close();
});

const post = <T>(path: string, body: unknown): Promise<T> =>
  h.api<T>(path, { ...JSON_POST, body: JSON.stringify(body) });

const readEventLog = async (): Promise<Event[]> =>
  parseEvents(await readFile(join(h.dir, 'events.jsonl'), 'utf8'));

const routeOf = (route: string): Promise<RouteFile> => h.api<RouteFile>(`/__annot/routes/${slug(route)}`);

describe('discovery', () => {
  it('answers /health with the protocol version and the dir', async () => {
    const health = await h.api<HealthResponse>('/__annot/health');
    expect(health).toEqual({ ok: true, protocolVersion: 1, dir: h.dir });
  });

  it('writes server.json once listening and removes it on close', async () => {
    const file = join(h.dir, 'server.json');
    await until(() => exists(file));
    const info = JSON.parse(await readFile(file, 'utf8')) as ServerInfo;
    expect(info.pid).toBe(process.pid);
    expect(info.protocolVersion).toBe(1);
    expect(info.basePath).toBe('/__annot');
    expect(info.port).toBe(Number(new URL(h.url).port));

    const res = await fetch(`${h.url}/__annot/health`);
    expect(res.status).toBe(200);

    await h.server.close();
    await until(async () => !(await exists(file)));
  });

  it('404s an unknown endpoint under the base path', async () => {
    const res = await h.raw('/__annot/nope');
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain('no route');
  });
});

describe('annotations', () => {
  it('assigns numbers per route and lists the route file', async () => {
    const first = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const second = await post<Annotation>('/__annot/annotations', makeAnnotation());
    expect(first.number).toBe(1);
    expect(second.number).toBe(2);

    const file = await routeOf('/pricing');
    expect(file.route).toBe('/pricing');
    expect(file.nextNumber).toBe(3);
    expect(file.annotations.map((a) => a.id)).toEqual([first.id, second.id]);

    const routes = await h.api<RoutesResponse>('/__annot/routes');
    expect(routes.routes).toEqual(['/pricing']);
    expect(routes.summaries?.[0]?.counts.draft).toBe(2);
  });

  it('rejects an invalid annotation with the problem list', async () => {
    const res = await h.raw('/__annot/annotations', {
      ...JSON_POST,
      body: JSON.stringify({ ...makeAnnotation(), route: 'pricing' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; problems: string[] };
    expect(body.error).toBe('invalid annotation');
    expect(body.problems.join()).toContain('route: must start with /');
  });

  it('returns an empty route file for a route with nothing on it', async () => {
    const file = await h.api<RouteFile>('/__annot/routes/nothing-here?route=%2Fnothing');
    expect(file).toMatchObject({ route: '/nothing', nextNumber: 1, annotations: [] });
  });

  it('re-posting the same id updates instead of duplicating', async () => {
    const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const updated = await post<Annotation>('/__annot/annotations', {
      ...created,
      comment: 'Actually make it wider.',
    });
    expect(updated.number).toBe(created.number);
    expect((await routeOf('/pricing')).annotations).toHaveLength(1);
    const types = (await readEventLog()).map((e) => e.type);
    expect(types).toEqual(['annotation.created', 'annotation.updated']);
  });

  it('patches the comment and appends a thread message', async () => {
    const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const patched = await h.api<Annotation>(`/__annot/annotations/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment: 'and align it left' }),
    });
    expect(patched.comment).toBe('and align it left');
    expect(patched.thread.at(-1)).toMatchObject({ role: 'user', kind: 'comment', text: 'and align it left' });
    expect((await readEventLog()).at(-1)?.type).toBe('thread.message');
  });

  it('deletes a draft and refuses to delete anything sent', async () => {
    const draft = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const kept = await post<Annotation>('/__annot/annotations', makeAnnotation());
    await post<Batch>('/__annot/batches', {
      route: '/pricing',
      annotationIds: [kept.id],
      summary: null,
    });

    expect(await h.api(`/__annot/annotations/${draft.id}`, { method: 'DELETE' })).toEqual({ ok: true });
    const refused = await h.raw(`/__annot/annotations/${kept.id}`, { method: 'DELETE' });
    expect(refused.status).toBe(409);
    expect((await routeOf('/pricing')).annotations.map((a) => a.id)).toEqual([kept.id]);
  });
});

describe('batches and transitions', () => {
  it('sends a batch, flips the statuses and logs batch.sent with the batch', async () => {
    const a = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const b = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const batch = await post<Batch>('/__annot/batches', {
      route: '/pricing',
      annotationIds: [a.id, b.id],
      summary: 'both about spacing',
    });

    expect(batch.annotationIds).toEqual([a.id, b.id]);
    expect(batch.summary).toBe('both about spacing');

    const file = await routeOf('/pricing');
    expect(file.annotations.map((x) => x.status)).toEqual(['sent', 'sent']);
    expect(file.annotations.map((x) => x.batch)).toEqual([batch.id, batch.id]);
    expect(file.annotations.every((x) => x.sentAt !== null)).toBe(true);

    const events = await readEventLog();
    const sent = events.find((e) => e.type === 'batch.sent');
    expect(sent?.data).toEqual(batch);
    expect(sent?.batchId).toBe(batch.id);
    expect(events.filter((e) => e.type === 'status.changed')).toHaveLength(2);

    const stored = JSON.parse(await readFile(join(h.dir, 'batches', `${batch.id}.json`), 'utf8')) as Batch;
    expect(stored).toEqual(batch);
  });

  it('walks the lifecycle through HTTP transitions by the agent', async () => {
    const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
    await post<Batch>('/__annot/batches', {
      route: '/pricing',
      annotationIds: [created.id],
      summary: null,
    });

    const acked = await post<Annotation>(`/__annot/annotations/${created.id}/transition`, {
      to: 'acknowledged',
      by: 'agent',
    });
    expect(acked.status).toBe('acknowledged');

    const asked = await post<Annotation>(`/__annot/annotations/${created.id}/transition`, {
      to: 'question',
      by: 'agent',
      message: { kind: 'question', text: 'Only Pro, or Free too?', role: 'agent' },
    });
    expect(asked.thread.at(-1)).toMatchObject({ kind: 'question', role: 'agent' });

    const answered = await post<Annotation>(`/__annot/annotations/${created.id}/transition`, {
      to: 'acknowledged',
      by: 'user',
      message: { kind: 'answer', text: 'Only Pro.', role: 'user' },
    });
    expect(answered.status).toBe('acknowledged');

    const done = await post<Annotation>(`/__annot/annotations/${created.id}/transition`, {
      to: 'review',
      by: 'agent',
      resolution: { kind: 'changed', summary: 'Set the button height to 40px.' },
    });
    expect(done.resolution).toEqual({ kind: 'changed', summary: 'Set the button height to 40px.' });
    expect(done.resolvedAt).not.toBeNull();
    expect(done.thread.at(-1)).toMatchObject({ kind: 'summary', role: 'agent' });

    const approved = await post<Annotation>(`/__annot/annotations/${created.id}/transition`, {
      to: 'approved',
      by: 'user',
    });
    expect(approved.approvedAt).not.toBeNull();
  });

  it('maps a declined resolution onto a decline message', async () => {
    const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
    await post<Batch>('/__annot/batches', { route: '/pricing', annotationIds: [created.id], summary: null });
    const declined = await post<Annotation>(`/__annot/annotations/${created.id}/transition`, {
      to: 'review',
      by: 'agent',
      resolution: { kind: 'declined', summary: 'That is intentional.' },
    });
    expect(declined.resolution).toEqual({ kind: 'declined', summary: 'That is intentional.' });
    expect(declined.thread.at(-1)?.kind).toBe('decline');
  });

  it('reopens into a fresh batch', async () => {
    const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const first = await post<Batch>('/__annot/batches', {
      route: '/pricing',
      annotationIds: [created.id],
      summary: null,
    });
    await post(`/__annot/annotations/${created.id}/transition`, { to: 'acknowledged', by: 'agent' });
    await post(`/__annot/annotations/${created.id}/transition`, {
      to: 'review',
      by: 'agent',
      resolution: { kind: 'changed', summary: 'done' },
    });

    const reopened = await post<Annotation>(`/__annot/annotations/${created.id}/transition`, {
      to: 'sent',
      by: 'user',
      message: { kind: 'reopen', text: 'still uneven', role: 'user' },
    });
    expect(reopened.status).toBe('sent');
    expect(reopened.resolution).toBeNull();
    expect(reopened.batch).not.toBe(first.id);
    expect(reopened.batch).not.toBeNull();

    const events = await readEventLog();
    const batches = events.filter((e) => e.type === 'batch.sent');
    expect(batches).toHaveLength(2);
    expect((batches.at(-1)?.data as Batch).annotationIds).toEqual([created.id]);
  });

  it('409s an illegal transition and names the allowed moves', async () => {
    const created = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const res = await h.raw(`/__annot/annotations/${created.id}/transition`, {
      ...JSON_POST,
      body: JSON.stringify({ to: 'approved', by: 'agent' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; problems: string[] };
    expect(body.error).toContain('illegal transition draft -> approved by agent');
    expect(body.problems).toEqual([]);
  });
});

describe('events', () => {
  it('serves the log with a since cursor', async () => {
    await post<Annotation>('/__annot/annotations', makeAnnotation());
    await post<Annotation>('/__annot/annotations', makeAnnotation());
    const all = await h.api<{ events: Event[] }>('/__annot/events');
    expect(all.events.map((e) => e.seq)).toEqual([1, 2]);
    const rest = await h.api<{ events: Event[] }>('/__annot/events?since=1');
    expect(rest.events.map((e) => e.seq)).toEqual([2]);
  });

  it('streams replayed and live events in seq order', async () => {
    const first = await post<Annotation>('/__annot/annotations', makeAnnotation());
    const stream = readSse(`${h.url}/__annot/events/stream?since=0`, 3);
    await stream.ready;
    const second = await post<Annotation>('/__annot/annotations', makeAnnotation());
    await post<Batch>('/__annot/batches', {
      route: '/pricing',
      annotationIds: [first.id, second.id],
      summary: null,
    });

    const events = await stream.events;
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(events.map((e) => e.type)).toEqual([
      'annotation.created',
      'annotation.created',
      'status.changed',
    ]);
  });

  it('replays only what follows the since cursor', async () => {
    await post<Annotation>('/__annot/annotations', makeAnnotation());
    await post<Annotation>('/__annot/annotations', makeAnnotation());
    const events = await readSse(`${h.url}/__annot/events/stream?since=1`, 1).events;
    expect(events.map((e) => e.seq)).toEqual([2]);
  });
});

describe('screenshots', () => {
  it('round-trips a PNG and attaches it to a page annotation', async () => {
    const created = await post<Annotation>('/__annot/annotations', pageAnnotation());
    const res = await h.api<ScreenshotResponse>(`/__annot/screenshots/${created.id}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: PNG,
    });
    expect(res.path).toBe(`screenshots/${created.id}.png`);
    expect(await readFile(join(h.dir, res.path))).toEqual(PNG);

    const file = await routeOf('/pricing');
    const target = file.annotations[0]?.target;
    expect(target?.kind === 'page' && target.screenshot).toBe(res.path);
  });

  it('rejects a body that is not a PNG', async () => {
    const created = await post<Annotation>('/__annot/annotations', pageAnnotation());
    const res = await h.raw(`/__annot/screenshots/${created.id}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: Buffer.from('not a png at all'),
    });
    expect(res.status).toBe(400);
  });

  it('removes the screenshot when its draft is deleted', async () => {
    const created = await post<Annotation>('/__annot/annotations', pageAnnotation());
    await h.api(`/__annot/screenshots/${created.id}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: PNG,
    });
    await h.api(`/__annot/annotations/${created.id}`, { method: 'DELETE' });
    await expect(stat(join(h.dir, 'screenshots', `${created.id}.png`))).rejects.toThrow();
  });
});

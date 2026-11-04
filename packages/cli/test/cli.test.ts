import { PROTOCOL_VERSION } from '@llm-ui-annotation/core';
import { readAllAnnotations, readEvents } from '@llm-ui-annotation/core/node';
import { describe, expect, it } from 'vitest';
import { IDS, makeFixture } from './fixtures.js';
import { annot } from './helpers.js';

describe('discovery', () => {
  it('says so when the dev server is not running', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'routes');
    expect(res.err).toContain('dev server not running, writing files directly');
  });

  it('fails with exit 1 when there is no annotations dir', async () => {
    const res = await annot('/nowhere/.annotations', 'pending');
    expect(res.code).toBe(1);
  });
});

describe('help', () => {
  it('fits on one screen and lists the verbs in lifecycle order', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, '--help');
    expect(res.code).toBe(0);
    const lines = res.out.split('\n');
    expect(lines.length).toBeLessThanOrEqual(40);
    const order = ['watch', 'pending', 'show', 'ack', 'ask', 'reply', 'done', 'decline', 'init'];
    const positions = order.map((verb) => res.out.indexOf(`  ${verb} `));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('exits 1 with no command', async () => {
    const { dir } = await makeFixture();
    expect((await annot(dir)).code).toBe(1);
  });

  it('rejects an unknown command', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'frobnicate');
    expect(res.code).toBe(1);
    expect(res.err).toContain('unknown command');
  });
});

describe('pending', () => {
  it('groups by route and lists only what waits on the agent', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'pending');
    expect(res.code).toBe(0);
    expect(res.out).toContain('## /pricing');
    expect(res.out).toContain('### #4 · element · button "Choose Pro"');
    expect(res.out).toContain('### #6 · element');
    expect(res.out).not.toContain('Hero copy');
    expect(res.out).toContain('annot ack <id…>');
  });

  it('filters by route and is idempotent', async () => {
    const { dir } = await makeFixture();
    const a = await annot(dir, 'pending', '--route', '/');
    const b = await annot(dir, 'pending', '--route', '/');
    expect(a.out).toBe(b.out);
    expect(a.out.trim()).toBe('No pending annotations.');
    expect(a.code).toBe(0);
  });

  it('has a --json shape', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'pending', '--json');
    const parsed = JSON.parse(res.out) as { count: number; annotations: { id: string }[] };
    expect(parsed.count).toBe(3);
    expect(parsed.annotations.map((a) => a.id)).toEqual([IDS.a, IDS.b, IDS.c]);
  });

  it('honours --level', async () => {
    const { dir } = await makeFixture();
    const compact = await annot(dir, 'pending', '--level', 'compact');
    expect(compact.out).not.toContain('styles:');
    const detailed = await annot(dir, 'pending', '--level', 'detailed');
    expect(detailed.out).toContain('fallbacks:');
    expect((await annot(dir, 'pending', '--level', 'loud')).code).toBe(1);
  });
});

describe('id resolution', () => {
  it('takes a full id, a unique prefix, and #<number>', async () => {
    const { dir } = await makeFixture();
    expect((await annot(dir, 'show', IDS.b, '--json')).out).toContain(IDS.b);
    expect((await annot(dir, 'show', '01jbzzzzzzb', '--json')).out).toContain(IDS.b);
    expect((await annot(dir, 'show', '#5', '--json')).out).toContain(IDS.b);
    expect((await annot(dir, 'show', '5', '--json')).out).toContain(IDS.b);
  });

  it('reports an ambiguous prefix and an ambiguous number', async () => {
    const { dir } = await makeFixture();
    const prefix = await annot(dir, 'show', '01JBZZZZZZ');
    expect(prefix.code).toBe(1);
    expect(prefix.err).toContain('matches 4 annotations');
    const number = await annot(dir, 'show', '#4');
    expect(number.code).toBe(1);
    expect(number.err).toContain('pass --route');
    expect((await annot(dir, 'show', '#4', '--route', '/pricing')).code).toBe(0);
  });

  it('reports an unknown id', async () => {
    const { dir } = await makeFixture();
    expect((await annot(dir, 'show', 'ZZZZ')).code).toBe(1);
  });
});

describe('show', () => {
  it('prints the thread at detailed level', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'show', '#6', '--route', '/pricing');
    expect(res.out).toContain('thread:');
    expect(res.out).toContain('status: acknowledged');
    expect(res.out).toContain('main > h2');
  });

  it('takes several ids at once', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'show', IDS.a, IDS.b, '--json');
    const parsed = JSON.parse(res.out) as { annotations: unknown[] };
    expect(parsed.annotations).toHaveLength(2);
  });
});

describe('lifecycle verbs', () => {
  it('acks, asks, replies and finishes', async () => {
    const { dir } = await makeFixture();
    expect((await annot(dir, 'ack', IDS.a)).out.trim()).toBe('#4 → acknowledged');
    expect((await annot(dir, 'ask', IDS.a, 'Only Pro, or Free too?')).out.trim()).toBe('#4 → question');
    expect((await annot(dir, 'reply', IDS.c, 'Looking at it now.')).out.trim()).toBe(
      '#6 → acknowledged (comment)',
    );
    const done = await annot(dir, 'done', IDS.c, '--summary', 'Evened the gaps in Pricing.svelte.');
    expect(done.out.trim()).toBe('#6 → review (changed)');

    const all = await readAllAnnotations(dir);
    const c = all.find((a) => a.id === IDS.c);
    expect(c?.status).toBe('review');
    expect(c?.resolution).toEqual({ kind: 'changed', summary: 'Evened the gaps in Pricing.svelte.' });
    expect(c?.thread.map((m) => m.kind)).toEqual(['comment', 'comment', 'summary']);
  });

  it('declines with a reason', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'decline', IDS.b, '--reason', 'That wording is deliberate.');
    expect(res.out.trim()).toBe('#5 → review (declined)');
    const b = (await readAllAnnotations(dir)).find((a) => a.id === IDS.b);
    expect(b?.resolution?.kind).toBe('declined');
  });

  it('acks several ids at once', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'ack', IDS.a, IDS.b);
    expect(res.out.trim().split('\n')).toEqual(['#4 → acknowledged', '#5 → acknowledged']);
  });

  it('exits 2 on an illegal transition and names the allowed moves', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'ack', IDS.c);
    expect(res.code).toBe(2);
    expect(res.err).toContain('allowed: question, review');
  });

  it('needs --summary and --reason', async () => {
    const { dir } = await makeFixture();
    expect((await annot(dir, 'done', IDS.a)).code).toBe(1);
    expect((await annot(dir, 'decline', IDS.a)).code).toBe(1);
  });

  it('logs one event per move', async () => {
    const { dir } = await makeFixture();
    await annot(dir, 'ack', IDS.a);
    await annot(dir, 'done', IDS.a, '--summary', 'Bumped the height.');
    const events = await readEvents(dir, 1);
    expect(events.map((e) => `${e.type}:${String(e.status)}`)).toEqual([
      'status.changed:acknowledged',
      'status.changed:review',
    ]);
    expect(events.map((e) => e.seq)).toEqual([2, 3]);
    expect(events[1]?.message?.kind).toBe('summary');
  });
});

describe('routes, doctor', () => {
  it('lists routes with counts', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'routes');
    expect(res.out).toContain('/pricing');
    expect(res.out).toContain('2 sent, 1 acknowledged');
    const asJson = JSON.parse((await annot(dir, 'routes', '--json')).out) as {
      routes: { route: string; counts: Record<string, number> }[];
    };
    expect(asJson.routes.map((r) => r.route)).toEqual(['/', '/pricing']);
  });

  it('reports the setup', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'doctor');
    expect(res.out).toContain(`dir:      ${dir}`);
    expect(res.out).toContain('not running');
    expect(res.out).toContain(`protocol: ${PROTOCOL_VERSION}`);
    const parsed = JSON.parse((await annot(dir, 'doctor', '--json')).out) as {
      transport: string;
      lastSeq: number;
      pending: number;
    };
    expect(parsed).toMatchObject({ transport: 'file', lastSeq: 1, pending: 3 });
  });
});

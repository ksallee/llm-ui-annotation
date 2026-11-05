import { assignBatch, type Annotation, type Batch, type Status } from '@llm-ui-annotation/core';
import { appendEvent, readAllAnnotations, readRoute, writeBatch, writeRoute } from '@llm-ui-annotation/core/node';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FileStore } from '../src/store.js';
import { annotation, BATCH, IDS, makeFixture, PRICING } from './fixtures.js';
import { annot } from './helpers.js';

beforeAll(() => {
  process.env['ANNOT_COLLECT_MS'] = '250';
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function find(dir: string, id: string): Promise<Annotation> {
  const a = (await readAllAnnotations(dir)).find((x) => x.id === id);
  if (!a) throw new Error(`missing ${id}`);
  return a;
}

/** What the plugin does when the user acts in the browser. */
async function userMoves(dir: string, id: string, to: Status, kind: 'answer' | 'reopen', text: string): Promise<void> {
  const store = new FileStore(dir);
  await store.transition(await find(dir, id), to, 'user', { role: 'user', kind, text });
}

async function sendBatch(dir: string, id: string, annotationIds: string[]): Promise<Batch> {
  const batch: Batch = { id, route: '/pricing', annotationIds, summary: 'second pass', sentAt: new Date().toISOString() };
  const file = await readRoute(dir, '/pricing');
  await writeRoute(dir, {
    ...file,
    annotations: file.annotations.map((a) =>
      annotationIds.includes(a.id) ? assignBatch({ ...a, status: 'sent' }, id) : a,
    ),
  });
  await writeBatch(dir, batch);
  await appendEvent(dir, {
    at: batch.sentAt,
    type: 'batch.sent',
    by: 'user',
    route: '/pricing',
    batchId: id,
    data: batch,
  });
  return batch;
}

/** What the plugin does after it wrote a user's replacement into the source. */
async function userReplaces(dir: string): Promise<Annotation> {
  const at = new Date().toISOString();
  const edit = annotation({
    id: '01JBZZZZZZEEEEEEEEEEEEEEEE',
    number: 7,
    mode: 'text',
    status: 'approved',
    batch: null,
    approvedAt: at,
    kind: 'replace',
    replacement: { text: 'Cancel whenever you like', file: 'docs/pricing.md' },
    target: { ...(PRICING[1]?.target as Annotation['target']) },
    comment: 'Replaced "Cancel anytime, no questions asked" with "Cancel whenever you like"',
  });
  const file = await readRoute(dir, '/pricing');
  await writeRoute(dir, { ...file, annotations: [...file.annotations, edit] });
  await appendEvent(dir, { at, type: 'annotation.created', by: 'user', route: '/pricing', annotationId: edit.id, data: edit });
  return edit;
}

describe('watch', () => {
  it('delivers the backlog and writes the cursor', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'watch', '--timeout', '5');
    expect(res.code).toBe(0);
    expect(res.out).toContain(`## Feedback batch ${BATCH.id}`);
    expect(res.out).toContain('route /pricing');
    expect(res.out).toContain('Summary from the user: all about the pricing table spacing.');
    expect(res.out.trimEnd().endsWith('cursor: 1')).toBe(true);
    expect((await readFile(join(dir, '.cursor-agent'), 'utf8')).trim()).toBe('1');
  });

  it('refuses an agent name that would name a file elsewhere', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'watch', '--agent', '../../escape', '--timeout', '5');
    expect(res.code).toBe(1);
    expect(res.err).toContain('--agent');
  });

  it('never re-delivers what the cursor already covers', async () => {
    const { dir } = await makeFixture();
    await annot(dir, 'watch', '--timeout', '5');
    const again = await annot(dir, 'watch', '--timeout', '1');
    expect(again.code).toBe(124);
    expect(again.out).toBe('');
  });

  it('exits 124 with no stdout on timeout', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'watch', '--from-now', '--timeout', '1');
    expect(res.code).toBe(124);
    expect(res.out).toBe('');
  });

  it('wakes on a batch that lands while it blocks', async () => {
    const { dir } = await makeFixture();
    const started = Date.now();
    const [res] = await Promise.all([
      annot(dir, 'watch', '--from-now', '--timeout', '10'),
      sleep(200).then(() => sendBatch(dir, '01JBZZZZZZ00000000000000B1', [IDS.a])),
    ]);
    expect(res.code).toBe(0);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.out).toContain('## Feedback batch 01JBZZZZZZ00000000000000B1');
    expect(res.out).toContain('### #4');
  });

  it('collects a second batch inside the window', async () => {
    const { dir } = await makeFixture();
    const [res] = await Promise.all([
      annot(dir, 'watch', '--from-now', '--timeout', '10'),
      (async () => {
        await sleep(100);
        await sendBatch(dir, '01JBZZZZZZ00000000000000B1', [IDS.a]);
        await sleep(60);
        await sendBatch(dir, '01JBZZZZZZ00000000000000B2', [IDS.b]);
      })(),
    ]);
    expect(res.out).toContain('01JBZZZZZZ00000000000000B1');
    expect(res.out).toContain('01JBZZZZZZ00000000000000B2');
  });

  it('wakes on an answer to a question', async () => {
    const { dir } = await makeFixture();
    await annot(dir, 'ask', IDS.a, 'Only Pro, or Free too?');
    const [res] = await Promise.all([
      annot(dir, 'watch', '--from-now', '--timeout', '10'),
      sleep(150).then(() => userMoves(dir, IDS.a, 'acknowledged', 'answer', 'Only Pro. Free stays 40px.')),
    ]);
    expect(res.code).toBe(0);
    expect(res.out).toContain(`## Answer on #4 (${IDS.a})`);
    expect(res.out).toContain('Q (agent): Only Pro, or Free too?');
    expect(res.out).toContain('A (user): Only Pro. Free stays 40px.');
    expect(res.out).toContain('→ status acknowledged, continue.');
  });

  it('wakes on a reopen', async () => {
    const { dir } = await makeFixture();
    await annot(dir, 'done', IDS.a, '--summary', 'Bumped the height.');
    const [res] = await Promise.all([
      annot(dir, 'watch', '--from-now', '--timeout', '10'),
      sleep(150).then(() => userMoves(dir, IDS.a, 'sent', 'reopen', 'Still uneven on the middle card.')),
    ]);
    expect(res.code).toBe(0);
    expect(res.out).toContain(`## Reopened #4 (${IDS.a})`);
    expect(res.out).toContain('User: Still uneven on the middle card.');
  });

  it('ignores moves the agent made itself', async () => {
    const { dir } = await makeFixture();
    const [res] = await Promise.all([
      annot(dir, 'watch', '--from-now', '--timeout', '1'),
      sleep(150).then(() => annot(dir, 'ack', IDS.a)),
    ]);
    expect(res.code).toBe(124);
  });

  it('takes --since over the cursor', async () => {
    const { dir } = await makeFixture();
    await annot(dir, 'watch', '--timeout', '5');
    const again = await annot(dir, 'watch', '--since', '0', '--timeout', '5');
    expect(again.code).toBe(0);
    expect(again.out).toContain(BATCH.id);
  });

  it('leaves the cursor alone with --no-cursor', async () => {
    const { dir } = await makeFixture();
    await annot(dir, 'watch', '--timeout', '5', '--no-cursor');
    await expect(readFile(join(dir, '.cursor-agent'), 'utf8')).rejects.toThrow();
  });

  it('keeps one cursor per --agent', async () => {
    const { dir } = await makeFixture();
    await annot(dir, 'watch', '--timeout', '5', '--agent', 'reviewer');
    expect((await readFile(join(dir, '.cursor-reviewer'), 'utf8')).trim()).toBe('1');
    expect((await annot(dir, 'watch', '--timeout', '5')).code).toBe(0);
  });

  it('has a --json shape', async () => {
    const { dir } = await makeFixture();
    const res = await annot(dir, 'watch', '--timeout', '5', '--json');
    const parsed = JSON.parse(res.out) as {
      cursor: number;
      batches: { batch: Batch; annotations: Annotation[] }[];
      answers: unknown[];
      events: { seq: number }[];
    };
    expect(parsed.cursor).toBe(1);
    expect(parsed.batches).toHaveLength(1);
    expect(parsed.batches[0]?.annotations.map((a) => a.id)).toEqual([IDS.a, IDS.b, IDS.c]);
    expect(parsed.answers).toEqual([]);
    expect(parsed.events.map((e) => e.seq)).toEqual([1]);
  });

  it('wakes on a user edit and prints it under User edits, which pending never lists', async () => {
    const { dir } = await makeFixture();
    await annot(dir, 'watch', '--timeout', '5');
    const edit = await userReplaces(dir);

    const res = await annot(dir, 'watch', '--timeout', '5');
    expect(res.code).toBe(0);
    expect(res.out).toContain('## User edits');
    expect(res.out).toContain(
      `- #7 docs/pricing.md: "Cancel anytime, no questions asked" → "Cancel whenever you like" (${edit.id})`,
    );
    expect(res.out).not.toContain('## Feedback batch');

    const pending = await annot(dir, 'pending');
    expect(pending.out).not.toContain(edit.id);
  });
});

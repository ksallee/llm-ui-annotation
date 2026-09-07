import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slug, type Annotation, type RouteFile } from '@llm-ui-annotation/core';
import { afterEach, describe, expect, it } from 'vitest';
import { makeAnnotation, startHarness, until, type Harness } from './helpers.js';

let harnesses: Harness[] = [];

const start = async (...args: Parameters<typeof startHarness>): Promise<Harness> => {
  const h = await startHarness(...args);
  harnesses.push(h);
  return h;
};

afterEach(async () => {
  const open = harnesses;
  harnesses = [];
  await Promise.all(open.map((h) => h.close()));
});

const post = <T>(h: Harness, path: string, body: unknown): Promise<T> =>
  h.api<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('the route lock', () => {
  it('serializes concurrent writes to the same route', async () => {
    const h = await start();
    const created = await Promise.all(
      Array.from({ length: 12 }, () => post<Annotation>(h, '/__annot/annotations', makeAnnotation())),
    );
    const numbers = created.map((a) => a.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    const file = await h.api<RouteFile>(`/__annot/routes/${slug('/pricing')}`);
    expect(file.annotations).toHaveLength(12);
    expect(file.nextNumber).toBe(13);

    const log = await readFile(join(h.dir, 'events.jsonl'), 'utf8');
    const seqs = log
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { seq: number }).seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('serializes a batch behind the creates it names', async () => {
    const h = await start();
    const created = await post<Annotation>(h, '/__annot/annotations', makeAnnotation());
    const [, transitioned] = await Promise.all([
      post(h, '/__annot/batches', { route: '/pricing', annotationIds: [created.id], summary: null }),
      post<Annotation>(h, `/__annot/annotations/${created.id}/transition`, { to: 'sent', by: 'user' }).catch(
        () => null,
      ),
    ]);
    const file = await h.api<RouteFile>(`/__annot/routes/${slug('/pricing')}`);
    expect(file.annotations[0]?.status).toBe('sent');
    expect(transitioned === null || transitioned.status === 'sent').toBe(true);
  });
});

describe('watch: poll', () => {
  it('notices an external edit without fs.watch', async () => {
    const h = await start({ watch: 'poll' });
    const created = await post<Annotation>(h, '/__annot/annotations', makeAnnotation());
    const path = join(h.dir, 'routes', `${slug('/pricing')}.json`);
    const file = JSON.parse(await readFile(path, 'utf8')) as RouteFile;
    (file.annotations[0] as Annotation).comment = 'polled';
    await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);

    await until(async () => {
      const served = await h.api<RouteFile>(`/__annot/routes/${slug('/pricing')}`);
      return served.annotations[0]?.comment === 'polled';
    }, 8000);
    expect(created.comment).toBe('Make this taller.');
  });
});

describe('init side effects', () => {
  it('warns once when the dir is missing from .gitignore', async () => {
    const h = await start({}, { '.gitignore': 'node_modules/\ndist/\n' });
    await until(() => h.warnings.some((w) => w.includes('.gitignore')));
    expect(h.warnings.find((w) => w.includes('.gitignore'))).toContain('annot init --gitignore');
  });

  it('stays quiet when the dir is already ignored', async () => {
    const h = await start({}, { '.gitignore': 'node_modules/\n.annotations/\n' });
    await until(() => h.infos.some((line) => line.startsWith('[annot]')));
    await new Promise((r) => setTimeout(r, 100));
    expect(h.warnings.filter((w) => w.includes('.gitignore'))).toEqual([]);
  });
});

describe('a damaged route file', () => {
  it('is ignored rather than taken down the server', async () => {
    const h = await start();
    await post<Annotation>(h, '/__annot/annotations', makeAnnotation());
    await writeFile(join(h.dir, 'routes', `${slug('/pricing')}.json`), 'null\n');

    await until(async () => (await h.api<RouteFile>(`/__annot/routes/${slug('/pricing')}`)).annotations.length === 1);
    expect(await h.api('/__annot/health')).toMatchObject({ ok: true });
    const fresh = await post<Annotation>(h, '/__annot/annotations', makeAnnotation({ route: '/other' }));
    expect(fresh.number).toBe(1);
  });
});

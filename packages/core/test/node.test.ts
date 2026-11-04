import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyRouteFile, nowIso, type Event, type NewEvent, type RouteFile } from '../src/index.js';
import {
  appendEvent,
  attachmentDirPath,
  attachmentPath,
  findAnnotationsDir,
  initDir,
  lastEventSeq,
  listRouteSlugs,
  listRoutes,
  readAllAnnotations,
  readBatch,
  readEvents,
  readRoute,
  readRouteBySlug,
  readAttachment,
  readServerInfo,
  removeAttachment,
  removeAttachments,
  removeServerInfo,
  writeAttachment,
  writeBatch,
  writeFileAtomic,
  writeRoute,
  writeServerInfo,
} from '../src/node/index.js';
import { BATCH, ELEMENT_ANNOTATION, TEXT_ANNOTATION } from './fixtures.js';

let dir: string;

beforeEach(async () => {
  dir = join(await mkdtemp(join(tmpdir(), 'annot-')), '.annotations');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function event(over: Partial<NewEvent> = {}): NewEvent {
  return {
    at: nowIso(),
    type: 'annotation.created',
    by: 'user',
    route: '/pricing',
    annotationId: ELEMENT_ANNOTATION.id,
    ...over,
  };
}

describe('route files', () => {
  it('treats a missing file as an empty route', async () => {
    const file = await readRoute(dir, '/pricing');
    expect(file.route).toBe('/pricing');
    expect(file.annotations).toEqual([]);
    expect(file.nextNumber).toBe(1);
    expect(await readRouteBySlug(dir, '__pricing')).toBeNull();
    expect(await listRouteSlugs(dir)).toEqual([]);
    expect(await listRoutes(dir)).toEqual([]);
    expect(await readAllAnnotations(dir)).toEqual([]);
  });

  it('round-trips through the slugged path', async () => {
    const file: RouteFile = {
      ...emptyRouteFile('/pricing', nowIso()),
      nextNumber: 5,
      annotations: [ELEMENT_ANNOTATION, TEXT_ANNOTATION],
    };
    await writeRoute(dir, file);
    expect(await readRoute(dir, '/pricing')).toEqual(file);
    expect(await readRouteBySlug(dir, '__pricing')).toEqual(file);
    expect(await listRouteSlugs(dir)).toEqual(['__pricing']);
    expect(await readAllAnnotations(dir)).toHaveLength(2);
  });

  it('leaves no tmp file behind', async () => {
    await writeRoute(dir, emptyRouteFile('/pricing', nowIso()));
    const names = await readdir(join(dir, 'routes'));
    expect(names).toEqual(['__pricing.json']);
  });

  it('treats an unparseable file as empty rather than throwing', async () => {
    await initDir(dir);
    await writeFile(join(dir, 'routes', '__pricing.json'), '{ half writ');
    expect((await readRoute(dir, '/pricing')).annotations).toEqual([]);
  });
});

describe('writeFileAtomic', () => {
  it('replaces the previous content in one step', async () => {
    const file = join(dir, 'x.txt');
    await writeFileAtomic(file, 'one');
    await writeFileAtomic(file, 'two');
    expect(await readFile(file, 'utf8')).toBe('two');
    expect(await readdir(dir)).toEqual(['x.txt']);
  });
});

describe('appendEvent', () => {
  it('starts at 1 and never rewrites the log', async () => {
    const a = await appendEvent(dir, event());
    const b = await appendEvent(dir, event({ type: 'batch.sent', batchId: BATCH.id }));
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect(await lastEventSeq(dir)).toBe(2);

    const raw = await readFile(join(dir, 'events.jsonl'), 'utf8');
    expect(raw.split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('continues from the tail written by another process', async () => {
    await initDir(dir);
    await writeFile(
      join(dir, 'events.jsonl'),
      `${JSON.stringify({ seq: 41, at: nowIso(), type: 'annotation.created', by: 'agent', route: '/x' })}\n`,
    );
    expect((await appendEvent(dir, event())).seq).toBe(42);
  });

  it('assigns distinct seqs to concurrent appends', async () => {
    const events = await Promise.all(
      Array.from({ length: 25 }, () => appendEvent(dir, event())),
    );
    const seqs = events.map((e: Event) => e.seq).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(await readEvents(dir)).toHaveLength(25);
  });

  it('reads back from a cursor', async () => {
    for (let i = 0; i < 4; i++) await appendEvent(dir, event());
    expect(await readEvents(dir, 2)).toHaveLength(2);
    expect(await readEvents(dir, 99)).toEqual([]);
  });

  it('returns nothing when there is no log', async () => {
    expect(await readEvents(dir)).toEqual([]);
    expect(await lastEventSeq(dir)).toBe(0);
  });
});

describe('batches and server info', () => {
  it('round-trips a batch', async () => {
    expect(await readBatch(dir, BATCH.id)).toBeNull();
    await writeBatch(dir, BATCH);
    expect(await readBatch(dir, BATCH.id)).toEqual(BATCH);
  });

  it('writes and removes server.json', async () => {
    expect(await readServerInfo(dir)).toBeNull();
    const info = {
      port: 5173,
      pid: process.pid,
      startedAt: nowIso(),
      protocolVersion: 1 as const,
      basePath: '/__annot',
    };
    await writeServerInfo(dir, info);
    expect(await readServerInfo(dir)).toEqual(info);
    await removeServerInfo(dir);
    expect(await readServerInfo(dir)).toBeNull();
    await removeServerInfo(dir);
  });
});

describe('findAnnotationsDir', () => {
  it('walks up from a nested cwd', async () => {
    await initDir(dir);
    const nested = join(dir, '..', 'src', 'lib');
    await writeFileAtomic(join(nested, 'x.ts'), '');
    expect(await findAnnotationsDir(nested)).toBe(dir);
  });

  it('returns null when there is none', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'annot-none-'));
    expect(await findAnnotationsDir(empty, '.no-such-dir-here')).toBeNull();
    await rm(empty, { recursive: true, force: true });
  });
});

describe('attachments', () => {
  const ID = ELEMENT_ANNOTATION.id;
  const FILE = '01JBZZZZZZ00000000000000A1';

  it('round-trips a file and removes it', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const rel = await writeAttachment(dir, ID, FILE, 'png', bytes);
    expect(rel).toBe(`attachments/${ID}/${FILE}.png`);
    expect(new Uint8Array((await readAttachment(dir, rel)) ?? new Uint8Array())).toEqual(bytes);
    await removeAttachment(dir, rel);
    expect(await readAttachment(dir, rel)).toBeNull();
  });

  it('refuses a path that leaves the annotations dir', async () => {
    await expect(readAttachment(dir, '../../etc/passwd')).rejects.toThrow(/escapes/);
    await expect(removeAttachment(dir, `attachments/${ID}/../../../x`)).rejects.toThrow(/escapes/);
    expect(() => attachmentPath(dir, '../secrets')).toThrow(/escapes/);
  });

  it('drops the whole directory, twice without complaining', async () => {
    await writeAttachment(dir, ID, FILE, 'png', new Uint8Array([1]));
    await removeAttachments(dir, ID);
    await removeAttachments(dir, ID);
    await expect(readdir(attachmentDirPath(dir, ID))).rejects.toThrow();
  });
});

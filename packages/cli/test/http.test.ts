import { readAllAnnotations, removeServerInfo } from '@llm-ui-annotation/core/node';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { probeServer } from '../src/context.js';
import { BATCH, IDS, makeFixture } from './fixtures.js';
import { annot } from './helpers.js';
import { startStub, type Stub } from './stub-server.js';

beforeAll(() => {
  process.env['ANNOT_COLLECT_MS'] = '250';
});

let stub: Stub | null = null;

afterEach(async () => {
  await stub?.close();
  stub = null;
});

async function served(): Promise<string> {
  const { dir } = await makeFixture();
  stub = await startStub(dir);
  return dir;
}

describe('the http path', () => {
  it('prefers the server when server.json is fresh and health answers', async () => {
    const dir = await served();
    const res = await annot(dir, 'doctor', '--json');
    expect(JSON.parse(res.out)).toMatchObject({ transport: 'http' });
    expect(res.err).not.toContain('dev server not running');
  });

  it('falls back to files when the port is dead', async () => {
    const dir = await served();
    await stub?.close();
    stub = null;
    const res = await annot(dir, 'doctor', '--json');
    expect(JSON.parse(res.out)).toMatchObject({ transport: 'file' });
  });

  it('falls back to files when server.json is gone', async () => {
    const dir = await served();
    await removeServerInfo(dir);
    expect(await probeServer(dir)).toBeNull();
  });

  it('is forced back to files by --no-http', async () => {
    const dir = await served();
    const res = await annot(dir, 'doctor', '--json', '--no-http');
    expect(JSON.parse(res.out)).toMatchObject({ transport: 'file' });
  });

  it('reads routes and annotations over http', async () => {
    const dir = await served();
    const res = await annot(dir, 'pending');
    expect(res.out).toContain('## /pricing');
    expect(res.out).toContain('### #4 · element');
  });

  it('moves an annotation through the transition endpoint', async () => {
    const dir = await served();
    expect((await annot(dir, 'ack', IDS.a)).out.trim()).toBe('#4 → acknowledged');
    const done = await annot(dir, 'done', IDS.a, '--summary', 'Matched the Free button height.');
    expect(done.out.trim()).toBe('#4 → review (changed)');
    const a = (await readAllAnnotations(dir)).find((x) => x.id === IDS.a);
    expect(a?.resolution?.summary).toBe('Matched the Free button height.');
  });

  it('exits 2 on an illegal transition reported by the server', async () => {
    const dir = await served();
    const res = await annot(dir, 'ack', IDS.c);
    expect(res.code).toBe(2);
  });

  it('watches over the SSE stream', async () => {
    const dir = await served();
    const res = await annot(dir, 'watch', '--timeout', '5');
    expect(res.code).toBe(0);
    expect(res.out).toContain(`## Feedback batch ${BATCH.id}`);
    expect(res.out.trimEnd().endsWith('cursor: 1')).toBe(true);
  });

  it('exits 124 when the stream stays quiet', async () => {
    const dir = await served();
    const res = await annot(dir, 'watch', '--from-now', '--timeout', '1');
    expect(res.code).toBe(124);
    expect(res.out).toBe('');
  });
});

// TODO(ws-05): unskip once packages/vite-plugin lands on dev; same assertions, real server.
describe.skip('against the real vite plugin', () => {
  it('runs the whole loop', () => {
    expect(true).toBe(true);
  });
});

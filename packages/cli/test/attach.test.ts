import { readAllAnnotations, readEvents } from '@llm-ui-annotation/core/node';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IDS, makeFixture } from './fixtures.js';
import { annot } from './helpers.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function fileNamed(name: string, bytes: Buffer | string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'annot-drop-'));
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}

describe('attach', () => {
  it('stores the file and lists it in pending with an absolute path', async () => {
    const { dir } = await makeFixture();
    const png = await fileNamed('mock-v2.png', PNG);

    const res = await annot(dir, 'attach', IDS.a, png);
    expect(res.code).toBe(0);
    expect(res.out).toContain('#4 attached mock-v2.png (image/png,');
    expect(res.out).toContain(`${dir}/attachments/${IDS.a}/`);

    const [stored] = (await readAllAnnotations(dir)).filter((a) => a.id === IDS.a);
    const attachment = stored?.attachments?.[0];
    expect(attachment).toMatchObject({ name: 'mock-v2.png', type: 'image/png', by: 'agent' });
    expect(await readFile(join(dir, attachment?.path ?? ''))).toEqual(PNG);

    for (const level of ['compact', 'standard', 'detailed']) {
      const listed = await annot(dir, 'pending', '--level', level);
      expect(listed.out, level).toContain('attachments:');
      expect(listed.out, level).toContain(
        `  ${join(dir, attachment?.path ?? '')}   mock-v2.png (image/png, 70 B)`,
      );
    }
  });

  it('takes several files at once and appends an annotation.updated per file', async () => {
    const { dir } = await makeFixture();
    const png = await fileNamed('mock.png', PNG);
    const md = await fileNamed('notes.md', '# Notes\n');

    const res = await annot(dir, 'attach', IDS.a, png, md);
    expect(res.code).toBe(0);
    const [stored] = (await readAllAnnotations(dir)).filter((a) => a.id === IDS.a);
    expect(stored?.attachments?.map((a) => a.type)).toEqual(['image/png', 'text/markdown']);
    const events = (await readEvents(dir)).filter((e) => e.type === 'annotation.updated');
    expect(events).toHaveLength(2);
  });

  it('refuses a type outside the accepted list', async () => {
    const { dir } = await makeFixture();
    const zip = await fileNamed('app.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]));
    const res = await annot(dir, 'attach', IDS.a, zip);
    expect(res.code).toBe(1);
    expect(res.err).toContain('unsupported file type');
    expect(res.err).toContain('accepted: image/png');
  });

  it('reports a missing file and usage', async () => {
    const { dir } = await makeFixture();
    expect((await annot(dir, 'attach', IDS.a, '/no/such/file.png')).err).toContain('cannot read');
    expect((await annot(dir, 'attach', IDS.a)).err).toContain('usage: annot attach');
  });

  it('shows them in --json and in show', async () => {
    const { dir } = await makeFixture();
    const png = await fileNamed('mock.png', PNG);
    const res = await annot(dir, 'attach', IDS.a, png, '--json');
    const body = JSON.parse(res.out) as { attachments: { name: string; path: string }[] };
    expect(body.attachments[0]?.name).toBe('mock.png');
    expect((await annot(dir, 'show', IDS.a)).out).toContain('mock.png (image/png, 70 B)');
  });
});

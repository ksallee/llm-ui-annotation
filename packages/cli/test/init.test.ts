import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_SECTION, SECTION_END, SECTION_START, upsertSection } from '../src/commands/init.js';
import { emptyProject } from './fixtures.js';
import { annot } from './helpers.js';

async function read(file: string): Promise<string> {
  return readFile(file, 'utf8');
}

describe('init', () => {
  it('creates the dir, the gitignore entry, the CLAUDE.md section and prints the vite snippet', async () => {
    const root = await emptyProject();
    const res = await annot(join(root, '.annotations'), 'init');
    expect(res.code).toBe(0);
    expect((await stat(join(root, '.annotations', 'routes'))).isDirectory()).toBe(true);
    expect(await read(join(root, '.gitignore'))).toBe('.annotations/\n');
    const claude = await read(join(root, 'CLAUDE.md'));
    expect(claude).toContain(SECTION_START);
    expect(claude).toContain('## UI feedback via annot');
    expect(claude).toContain(SECTION_END);
    expect(res.out).toContain('@llm-ui-annotation/vite-plugin');
  });

  it('is idempotent: running it twice produces identical files', async () => {
    const root = await emptyProject();
    const dir = join(root, '.annotations');
    await annot(dir, 'init');
    const first = { git: await read(join(root, '.gitignore')), md: await read(join(root, 'CLAUDE.md')) };
    await annot(dir, 'init');
    expect(await read(join(root, '.gitignore'))).toBe(first.git);
    expect(await read(join(root, 'CLAUDE.md'))).toBe(first.md);
    const second = await annot(dir, 'init', '--json');
    expect(JSON.parse(second.out)).toMatchObject({ gitignore: 'unchanged', claudeMd: 'unchanged' });
  });

  it('keeps the rest of an existing CLAUDE.md and replaces a stale section', async () => {
    const root = await emptyProject();
    const dir = join(root, '.annotations');
    const file = join(root, 'CLAUDE.md');
    await writeFile(file, `# House rules\n\nBe terse.\n\n${SECTION_START}\nold text\n${SECTION_END}\n\n## Git\n\nBranch per task.\n`);
    await annot(dir, 'init', '--claude-md');
    const text = await read(file);
    expect(text).toContain('Be terse.');
    expect(text).toContain('Branch per task.');
    expect(text).not.toContain('old text');
    expect(text).toContain('annot ask <id>');
    await annot(dir, 'init', '--claude-md');
    expect(await read(file)).toBe(text);
  });

  it('appends the entry to an existing gitignore only once', async () => {
    const root = await emptyProject();
    const dir = join(root, '.annotations');
    await writeFile(join(root, '.gitignore'), 'node_modules\ndist\n');
    await annot(dir, 'init', '--gitignore');
    await annot(dir, 'init', '--gitignore');
    expect(await read(join(root, '.gitignore'))).toBe('node_modules\ndist\n.annotations/\n');
  });

  it('does one thing when asked for one thing', async () => {
    const root = await emptyProject();
    const dir = join(root, '.annotations');
    await annot(dir, 'init', '--gitignore');
    await expect(read(join(root, 'CLAUDE.md'))).rejects.toThrow();
    const res = await annot(dir, 'init', '--claude-md', '--json');
    expect(JSON.parse(res.out)).toMatchObject({ gitignore: null, claudeMd: 'created' });
  });

  it('upsertSection is a fixed point', () => {
    const once = upsertSection('# Title\n', AGENT_SECTION);
    expect(upsertSection(once, AGENT_SECTION)).toBe(once);
    expect(upsertSection('', AGENT_SECTION)).toBe(`${AGENT_SECTION}\n`);
  });
});

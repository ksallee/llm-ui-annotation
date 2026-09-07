import { DEFAULT_DIR } from '@llm-ui-annotation/core';
import { initDir } from '@llm-ui-annotation/core/node';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { flagBool, type Args } from '../args.js';
import { locateDir, namedDir } from '../context.js';
import { EXIT_OK } from '../errors.js';
import { json, type Io } from '../output.js';

export const SECTION_START = '<!-- annot:start -->';
export const SECTION_END = '<!-- annot:end -->';

export const AGENT_SECTION = [
  SECTION_START,
  '## UI feedback via annot',
  '',
  'This project uses llm-ui-annotation. The user annotates the running UI in the browser; the feedback lands in `.annotations/`.',
  '',
  '- When asked to "watch for feedback" or "pick up annotations", run `annot watch` with `run_in_background` and keep working; when it exits, read its output, then start another `annot watch` before doing anything else so nothing is missed.',
  '- For each item: `annot ack <id>`, locate the code with the selector / quote / screenshot, make the change, then `annot done <id> --summary "<one or two sentences: what changed, where>"`. If you will not do it, `annot decline <id> --reason "..."`.',
  '- An item may carry an `attachments:` block of absolute paths — a mock, a PDF, notes the user dropped on it. Read them before changing anything; `annot attach <id> <file…>` hands a file back the other way.',
  '- A `styles:` line may name a token after a value, as `background-color oklch(0.55 0.15 250) var(--color-primary-600)`. Change or reuse the token; do not paste the literal value.',
  '- An item may carry a `style edits proposed by the user` diff. Those are exact values the user set in the browser: put each one in the rule that governs the element, and when the line names a token (`/* --space-5 */`) use the token, not the literal.',
  '- A batch may open with a `Questions:` line. It is the user saying how freely to ask: `none` means decide it yourself and say what you chose, `only when you are blocked` means one question at most and only when no sound choice exists, `freely` means check anything unclear. Honour it over your own instinct.',
  '- If the request is ambiguous and the budget allows, `annot ask <id> "<one precise question>"` and move on to other items; the answer arrives through `annot watch`.',
  '- Keep summaries concrete (file and what changed). The user reads them in the browser before approving.',
  '- Do not edit files under `.annotations/` by hand.',
  SECTION_END,
].join('\n');

export const VITE_SNIPPET = [
  "import { annotations } from '@llm-ui-annotation/vite-plugin';",
  '',
  'export default defineConfig({',
  '  plugins: [svelte(), annotations()],',
  '});',
].join('\n');

type Outcome = 'created' | 'updated' | 'unchanged';

async function readOrEmpty(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Replace the marked section, or append it. Running twice yields the same text. */
export function upsertSection(text: string, section: string): string {
  const start = text.indexOf(SECTION_START);
  const end = text.indexOf(SECTION_END);
  if (start !== -1 && end > start) {
    return text.slice(0, start) + section + text.slice(end + SECTION_END.length);
  }
  const base = text.replace(/\s+$/, '');
  return base === '' ? `${section}\n` : `${base}\n\n${section}\n`;
}

async function writeIfChanged(file: string, next: string, existed: boolean): Promise<Outcome> {
  const current = await readOrEmpty(file);
  if (current === next) return 'unchanged';
  await writeFile(file, next, 'utf8');
  return existed && current !== null ? 'updated' : 'created';
}

async function updateGitignore(root: string, entry: string): Promise<Outcome> {
  const file = join(root, '.gitignore');
  const current = await readOrEmpty(file);
  const lines = (current ?? '').split('\n').map((l) => l.trim());
  if (lines.includes(entry) || lines.includes(entry.replace(/\/$/, ''))) return 'unchanged';
  const base = (current ?? '').replace(/\s+$/, '');
  const next = base === '' ? `${entry}\n` : `${base}\n${entry}\n`;
  await writeFile(file, next, 'utf8');
  return current === null ? 'created' : 'updated';
}

async function updateClaudeMd(root: string): Promise<Outcome> {
  const file = join(root, 'CLAUDE.md');
  const current = await readOrEmpty(file);
  return writeIfChanged(file, upsertSection(current ?? '', AGENT_SECTION), current !== null);
}

export async function init(args: Args, io: Io): Promise<number> {
  const dir = namedDir(args) ?? (await locateDir(args)) ?? join(process.cwd(), DEFAULT_DIR);
  const root = dirname(dir);

  const wantsGitignore = flagBool(args, 'gitignore');
  const wantsClaudeMd = flagBool(args, 'claude-md');
  const all = !wantsGitignore && !wantsClaudeMd;

  await initDir(dir);
  const gitignore = all || wantsGitignore ? await updateGitignore(root, `${DEFAULT_DIR}/`) : null;
  const claudeMd = all || wantsClaudeMd ? await updateClaudeMd(root) : null;

  const result = { dir, root, gitignore, claudeMd };
  if (flagBool(args, 'json')) {
    json(io, result);
    return EXIT_OK;
  }

  const lines = [`${dir}  ready`];
  if (gitignore) lines.push(`${join(root, '.gitignore')}  ${gitignore}`);
  if (claudeMd) lines.push(`${join(root, 'CLAUDE.md')}  ${claudeMd}`);
  if (all) lines.push('', 'Add the plugin to your vite config:', '', VITE_SNIPPET);
  io.out(lines.join('\n'));
  return EXIT_OK;
}

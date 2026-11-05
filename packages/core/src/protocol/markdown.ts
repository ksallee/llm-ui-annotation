/** The markdown an agent reads: a batch, an answer, a reopen. */

import { elementLabel } from '../model/summarize.js';
import type {
  Annotation,
  Attachment,
  Batch,
  ElementRef,
  Message,
  Rect,
  StyleEdit,
  TextTarget,
} from '../model/types.js';
import { formatBytes } from './attachments.js';

export type RenderLevel = 'compact' | 'standard' | 'detailed';

export interface RenderOptions {
  level: RenderLevel;
  /** Annotations dir, absolute where the reader is expected to open attachments. */
  dir: string;
}

/** What each question level asks of the agent, in the words the agent reads. */
export const QUESTION_BUDGET: Record<number, string> = {
  0: 'none — decide it yourself and say what you chose in the summary',
  1: 'only when you are blocked and cannot make a sound choice',
  2: 'when the answer would change what you build',
  3: 'freely — check anything you are unsure of',
};

export const AGENT_VERBS_FOOTER =
  'Reply with: annot ack <id…> · annot ask <id> "…" · annot done <id> --summary "…" · annot decline <id> --reason "…"';

function joinPath(dir: string, rel: string): string {
  return `${dir.replace(/\/+$/, '')}/${rel}`;
}

// Every page-derived string goes through this. A newline in an aria-label or a data attribute would
// otherwise forge a line, and the agent reads these sections as structure.
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function sizeText(r: Rect): string {
  return `${Math.round(r.width)}×${Math.round(r.height)}`;
}

function rectText(r: Rect): string {
  return `${Math.round(r.x)},${Math.round(r.y)} ${sizeText(r)}`;
}

function pairs(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k} ${oneLine(v)}`)
    .join(' · ');
}

/** The style subset, each value followed by the token that produced it when one did. */
function styleText(el: ElementRef): string {
  return Object.entries(el.styles ?? {})
    .map(([prop, value]) => {
      const token = el.tokens?.[prop];
      if (token === undefined) return `${prop} ${value}`;
      return `${prop} ${value} ${token.split(' ').map((name) => `var(${name})`).join(' ')}`;
    })
    .join(' · ');
}

/** Paths as the project sees them: the dev server reports absolutes, the frameworks relatives. */
function shortPath(file: string, dir: string): string {
  const root = `${dirOf(dir)}/`;
  return file.startsWith(root) ? file.slice(root.length) : file;
}

const dirOf = (path: string): string => path.replace(/\/+$/, '').replace(/\/[^/]*$/, '');

/** Where the element was written, when the dev build said so. */
function sourceLine(el: ElementRef, dir: string): string {
  const at = el.source!;
  const place = at.line === undefined ? '' : `:${at.line}${at.column === undefined ? '' : `:${at.column}`}`;
  return `source: ${shortPath(at.file, dir)}${place}`;
}

/** The rules that style the element, as authored, so a change lands where the value lives. */
function declaredLines(el: ElementRef, dir: string): string[] {
  return [
    'declared:',
    ...el.declared!.map((d) => {
      const where = d.file === undefined ? d.from : `${d.from}   ${shortPath(d.file, dir)}`;
      return `  ${d.property}: ${oneLine(d.value)}${d.inherited ? '   inherited' : ''}   ${where}`;
    }),
  ];
}

function elementLines(el: ElementRef, level: RenderLevel, dir: string): string[] {
  const lines = [`selector: ${el.selector}`];
  if (el.source) lines.push(sourceLine(el, dir));

  const facts: string[] = [];
  if (el.text) facts.push(`text: ${oneLine(el.text)}`);
  facts.push(`rect: ${rectText(el.rect)}`);
  if (el.role) facts.push(`role: ${el.role}`);
  if (el.fixed) facts.push('fixed: yes');
  lines.push(facts.join('   '));

  if (level !== 'compact' && el.context) {
    const { parent, prev, next } = el.context;
    const name = (value: string | null): string => (value === null ? 'null' : oneLine(value));
    lines.push(`context: parent ${name(parent)}, prev ${name(prev)}, next ${name(next)}`);
  }
  if (level !== 'compact' && el.declared && el.declared.length > 0) {
    lines.push(...declaredLines(el, dir));
  }
  if (level !== 'compact' && el.styles && Object.keys(el.styles).length > 0) {
    lines.push(`styles: ${styleText(el)}`);
  }
  if (level === 'detailed') {
    if (el.fallbacks.length > 0) lines.push(`fallbacks: ${el.fallbacks.join(' | ')}`);
    if (Object.keys(el.attrs).length > 0) lines.push(`attrs: ${pairs(el.attrs)}`);
  }
  return lines;
}

function textLines(t: TextTarget, level: RenderLevel, dir: string): string[] {
  const lines: string[] = [];
  const quote = `quote: ${JSON.stringify(t.quote)}`;
  if (level === 'compact') {
    lines.push(quote);
  } else {
    lines.push(`${quote}   prefix: ${JSON.stringify(t.prefix)}   suffix: ${JSON.stringify(t.suffix)}`);
    lines.push(`container: ${t.container.selector}   offsets: ${t.start}-${t.end}`);
    if (t.container.source) lines.push(sourceLine(t.container, dir));
  }
  if (level !== 'compact' && t.blocks) {
    lines.push(`blocks: ${t.blocks.map((b) => b.selector).join(', ')}`);
  }
  if (level === 'detailed' && t.container.fallbacks.length > 0) {
    lines.push(`fallbacks: ${t.container.fallbacks.join(' | ')}`);
  }
  return lines;
}

function headerLabel(a: Annotation): string {
  switch (a.target.kind) {
    case 'element': {
      const [first, ...rest] = a.target.elements;
      if (!first) return 'no element';
      return rest.length === 0
        ? elementLabel(first)
        : `${a.target.elements.length} elements: ${a.target.elements.map(elementLabel).join(', ')}`;
    }
    case 'text':
      return a.target.blocks
        ? `across ${a.target.blocks.map((b) => b.selector).join(', ')}`
        : `in ${a.target.container.selector}`;
  }
}

/** Absolute paths, because the agent opens them with its own file tools. */
function attachmentLines(list: readonly Attachment[], dir: string): string[] {
  return [
    'attachments:',
    ...list.map(
      (a) => `  ${joinPath(dir, a.path)}   ${a.name} (${a.type}, ${formatBytes(a.bytes)})`,
    ),
  ];
}

/**
 * The user's own edits as a CSS diff, one block per element. These are a proposal read off the live
 * page, not a patch: the selector is where it was seen, not necessarily where the rule lives.
 */
function styleEditLines(edits: readonly StyleEdit[], dir: string): string[] {
  const bySelector = new Map<string, StyleEdit[]>();
  for (const edit of edits) {
    const list = bySelector.get(edit.selector);
    if (list) list.push(edit);
    else bySelector.set(edit.selector, [edit]);
  }

  const lines = ['style edits proposed by the user:', '```diff'];
  for (const [selector, list] of bySelector) {
    lines.push(`  ${selector} {`);
    for (const e of list) {
      // The rule that holds the value today: the change belongs there, not in a new rule.
      const where = e.rule
        ? `   /* ${e.rule.selector}${e.rule.file ? ` in ${shortPath(e.rule.file, dir)}` : ''} */`
        : '';
      lines.push(`-   ${e.property}: ${e.from};${where}`);
      lines.push(`+   ${e.property}: ${e.to};${e.token ? `   /* ${e.token} */` : ''}`);
    }
    lines.push('  }');
  }
  lines.push('```');
  return lines;
}

function threadLines(thread: readonly Message[]): string[] {
  return ['thread:', ...thread.map((m) => `- ${m.role} ${m.kind} (${m.at}): ${oneLine(m.text)}`)];
}

/** One `###` section for an annotation. */
export function renderAnnotationMarkdown(a: Annotation, opts: RenderOptions): string {
  const lines = [`### #${a.number} · ${a.mode} · ${headerLabel(a)}`];

  switch (a.target.kind) {
    case 'element':
      a.target.elements.forEach((el, i) => {
        if (a.target.kind === 'element' && a.target.elements.length > 1) lines.push(`element ${i + 1}:`);
        lines.push(...elementLines(el, opts.level, opts.dir));
      });
      break;
    case 'text':
      lines.push(...textLines(a.target, opts.level, opts.dir));
      break;
  }

  if (opts.level === 'detailed') {
    lines.push(`status: ${a.status}${a.resolution ? ` (${a.resolution.kind})` : ''}`);
  }

  if (a.attachments && a.attachments.length > 0) {
    lines.push(...attachmentLines(a.attachments, opts.dir));
  }

  if (a.styleEdits && a.styleEdits.length > 0) lines.push(...styleEditLines(a.styleEdits, opts.dir));

  lines.push(`> ${oneLine(a.comment)}`);

  if (opts.level === 'detailed' && a.thread.length > 0) lines.push(...threadLines(a.thread));

  lines.push(`id: ${a.id}`);
  return lines.join('\n');
}

/** The markdown the agent reads when a batch lands. */
export function renderBatchMarkdown(
  batch: Batch,
  annotations: readonly Annotation[],
  opts: RenderOptions,
): string {
  const byId = new Map(annotations.map((a) => [a.id, a]));
  const items = batch.annotationIds
    .map((id) => byId.get(id))
    .filter((a): a is Annotation => a !== undefined);

  const blocks = [
    `## Feedback batch ${batch.id}  ·  route ${batch.route}  ·  ${items.length} item${items.length === 1 ? '' : 's'}`,
  ];
  if (batch.summary) blocks.push(`Summary from the user: ${oneLine(batch.summary)}`);
  if (batch.questions !== undefined) blocks.push(`Questions: ${QUESTION_BUDGET[batch.questions]}`);
  for (const a of items) blocks.push(renderAnnotationMarkdown(a, opts));
  blocks.push(AGENT_VERBS_FOOTER);
  return `${blocks.join('\n\n')}\n`;
}

function lastOfKind(a: Annotation, kind: Message['kind']): Message | undefined {
  for (let i = a.thread.length - 1; i >= 0; i--) {
    const m = a.thread[i];
    if (m && m.kind === kind) return m;
  }
  return undefined;
}

/** The short section for a user answer to an agent question. */
export function renderAnswerMarkdown(a: Annotation): string {
  const q = lastOfKind(a, 'question');
  const ans = lastOfKind(a, 'answer');
  const lines = [`## Answer on #${a.number} (${a.id})`];
  if (q) lines.push(`Q (agent): ${oneLine(q.text)}`);
  if (ans) lines.push(`A (user): ${oneLine(ans.text)}`);
  lines.push(`→ status ${a.status}, continue.`);
  return `${lines.join('\n')}\n`;
}

/** The short section for a reopened annotation. */
export function renderReopenMarkdown(a: Annotation, batchId: string | null = a.batch): string {
  const reopen = lastOfKind(a, 'reopen');
  const lines = [`## Reopened #${a.number} (${a.id})${batchId ? `, new batch ${batchId}` : ''}`];
  if (reopen) lines.push(`User: ${oneLine(reopen.text)}`);
  return `${lines.join('\n')}\n`;
}

/** The short section listing text the user rewrote in the source themselves. */
export function renderUserEditsMarkdown(edits: readonly Annotation[]): string {
  const lines = [
    '## User edits',
    'The user rewrote this text in the source; the files already hold it. Re-read them before editing nearby.',
  ];
  for (const a of edits) {
    const quote = a.target.kind === 'text' ? a.target.quote : '';
    const file = a.replacement?.file ?? '';
    lines.push(`- #${a.number} ${file}: "${oneLine(quote)}" → "${oneLine(a.replacement?.text ?? '')}" (${a.id})`);
  }
  return `${lines.join('\n')}\n`;
}

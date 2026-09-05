import { elementLabel } from '../model/summarize.js';
import type {
  Annotation,
  Batch,
  ElementRef,
  Message,
  PageTarget,
  Rect,
  TextTarget,
} from '../model/types.js';

export type RenderLevel = 'compact' | 'standard' | 'detailed';

export interface RenderOptions {
  level: RenderLevel;
  /** Annotations dir, absolute where the reader is expected to open screenshots. */
  dir: string;
}

export const AGENT_VERBS_FOOTER =
  'Reply with: annot ack <id…> · annot ask <id> "…" · annot done <id> --summary "…" · annot decline <id> --reason "…"';

function joinPath(dir: string, rel: string): string {
  return `${dir.replace(/\/+$/, '')}/${rel}`;
}

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
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
}

function elementLines(el: ElementRef, level: RenderLevel): string[] {
  const lines = [`selector: ${el.selector}`];

  const facts: string[] = [];
  if (el.text) facts.push(`text: ${oneLine(el.text)}`);
  facts.push(`rect: ${rectText(el.rect)}`);
  if (el.role) facts.push(`role: ${el.role}`);
  if (el.fixed) facts.push('fixed: yes');
  lines.push(facts.join('   '));

  if (level !== 'compact' && el.context) {
    const { parent, prev, next } = el.context;
    lines.push(`context: parent ${parent ?? 'null'}, prev ${prev ?? 'null'}, next ${next ?? 'null'}`);
  }
  if (level !== 'compact' && el.styles && Object.keys(el.styles).length > 0) {
    lines.push(`styles: ${pairs(el.styles)}`);
  }
  if (level === 'detailed') {
    if (el.fallbacks.length > 0) lines.push(`fallbacks: ${el.fallbacks.join(' | ')}`);
    if (Object.keys(el.attrs).length > 0) lines.push(`attrs: ${pairs(el.attrs)}`);
  }
  return lines;
}

function textLines(t: TextTarget, level: RenderLevel): string[] {
  const lines: string[] = [];
  const quote = `quote: ${JSON.stringify(t.quote)}`;
  if (level === 'compact') {
    lines.push(quote);
  } else {
    lines.push(`${quote}   prefix: ${JSON.stringify(t.prefix)}   suffix: ${JSON.stringify(t.suffix)}`);
    lines.push(`container: ${t.container.selector}   offsets: ${t.start}-${t.end}`);
  }
  if (level !== 'compact' && t.blocks) {
    lines.push(`blocks: ${t.blocks.map((b) => b.selector).join(', ')}`);
  }
  if (level === 'detailed' && t.container.fallbacks.length > 0) {
    lines.push(`fallbacks: ${t.container.fallbacks.join(' | ')}`);
  }
  return lines;
}

function pageLines(t: PageTarget, level: RenderLevel, dir: string): string[] {
  const lines: string[] = [];
  if (t.screenshot) {
    lines.push(`screenshot: ${joinPath(dir, t.screenshot)}  (${sizeText(t.region)})`);
  } else {
    lines.push(`screenshot: none (capture failed)   region: ${rectText(t.region)}`);
  }
  if (t.elements.length > 0) {
    lines.push(
      `elements: ${t.elements.map((e) => `${elementLabel(e)} (${e.selector})`).join(', ')}`,
    );
  }
  // The words the user wrote onto the drawing are feedback, not decoration.
  const captions = t.strokes.filter((s) => s.tool === 'label').map((s) => s.text.trim()).filter(Boolean);
  if (captions.length > 0) lines.push(`captions: ${captions.map((c) => `"${c}"`).join(', ')}`);
  if (level === 'detailed') {
    lines.push(`strokes: ${t.strokes.map((s) => s.tool).join(', ') || 'none'}`);
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
    case 'page':
      return `drawing over ${a.target.elements.map(elementLabel).join(', ') || `${a.target.strokes.length} strokes`}`;
  }
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
        lines.push(...elementLines(el, opts.level));
      });
      break;
    case 'text':
      lines.push(...textLines(a.target, opts.level));
      break;
    case 'page':
      lines.push(...pageLines(a.target, opts.level, opts.dir));
      break;
  }

  if (opts.level === 'detailed') {
    lines.push(`status: ${a.status}${a.resolution ? ` (${a.resolution.kind})` : ''}`);
  }

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

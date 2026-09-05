import {
  renderAnswerMarkdown,
  renderBatchMarkdown,
  renderReopenMarkdown,
  type Annotation,
  type Batch,
  type Event,
  type Message,
} from '@llm-ui-annotation/core';
import { flagBool, flagNumber, type Args } from '../args.js';
import type { Context } from '../context.js';
import { readCursor, writeCursor } from '../cursor.js';
import { EXIT_OK, EXIT_TIMEOUT } from '../errors.js';
import { json, type Io } from '../output.js';
import { renderLevel } from './read.js';

export const DEFAULT_TIMEOUT_S = 540;
export const DEFAULT_COLLECT_MS = 1500;

type Wake = 'batch' | 'answer' | 'reopen' | 'comment';

/** Which events wake the agent, and as what. */
export function wakeKind(e: Event): Wake | null {
  if (e.type === 'batch.sent') return 'batch';
  if (e.by !== 'user') return null;
  if (e.type === 'status.changed') {
    if (e.status === 'acknowledged') return 'answer';
    if (e.status === 'sent' && (e.from === 'review' || e.from === 'approved')) return 'reopen';
    return null;
  }
  if (e.type === 'thread.message') return e.message?.kind === 'reopen' ? 'reopen' : 'comment';
  return null;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function isBatch(x: unknown): x is Batch {
  return typeof x === 'object' && x !== null && 'annotationIds' in x;
}

function renderCommentMarkdown(a: Annotation, message: Message): string {
  return `## Comment on #${a.number} (${a.id})\nUser: ${message.text.replace(/\s+/g, ' ').trim()}\n→ status ${a.status}, continue.\n`;
}

async function collect(ctx: Context, since: number, timeoutMs: number, collectMs: number): Promise<Event[]> {
  const controller = new AbortController();
  const events: Event[] = [];
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  let window: ReturnType<typeof setTimeout> | undefined;
  try {
    for await (const event of ctx.store.stream(since, controller.signal)) {
      events.push(event);
      if (window === undefined && wakeKind(event) !== null) {
        window = setTimeout(() => controller.abort(), collectMs);
      }
    }
  } catch (err) {
    if (!isAbort(err)) throw err;
  } finally {
    clearTimeout(deadline);
    if (window !== undefined) clearTimeout(window);
  }
  return events;
}

/** Block until feedback arrives, print it, move the cursor. */
export async function watch(ctx: Context, args: Args, io: Io): Promise<number> {
  const since =
    flagNumber(args, 'since') ??
    (flagBool(args, 'from-now') ? await ctx.store.lastSeq() : await readCursor(ctx.dir, ctx.agent));
  const timeoutMs = (flagNumber(args, 'timeout') ?? DEFAULT_TIMEOUT_S) * 1000;
  const collectMs = Number(process.env['ANNOT_COLLECT_MS'] ?? DEFAULT_COLLECT_MS);

  const events = await collect(ctx, since, timeoutMs, collectMs);
  const woke = events.filter((e) => wakeKind(e) !== null);
  if (woke.length === 0) return EXIT_TIMEOUT;

  const routeFilter = ctx.route;
  const cursor = Math.max(since, ...events.map((e) => e.seq));
  const all = await ctx.store.annotations();
  const byId = new Map(all.map((a) => [a.id, a]));
  const level = renderLevel(args);
  const opts = { level, dir: ctx.dir };

  const batches: { batch: Batch; annotations: Annotation[] }[] = [];
  const answers: Annotation[] = [];
  const reopens: Annotation[] = [];
  const comments: { annotation: Annotation; message: Message }[] = [];
  const seen = new Set<string>();

  for (const event of woke) {
    if (routeFilter !== undefined && event.route !== routeFilter) continue;
    const kind = wakeKind(event);
    if (kind === 'batch') {
      const id = event.batchId ?? (isBatch(event.data) ? event.data.id : undefined);
      if (id === undefined || seen.has(`b:${id}`)) continue;
      seen.add(`b:${id}`);
      const batch = isBatch(event.data) ? event.data : await ctx.store.batch(id);
      if (!batch) continue;
      batches.push({
        batch,
        annotations: batch.annotationIds
          .map((aid) => byId.get(aid))
          .filter((a): a is Annotation => a !== undefined),
      });
      continue;
    }
    const a = event.annotationId ? byId.get(event.annotationId) : undefined;
    if (!a || seen.has(`${kind}:${a.id}`)) continue;
    seen.add(`${kind}:${a.id}`);
    if (kind === 'answer') answers.push(a);
    else if (kind === 'reopen') reopens.push(a);
    else if (event.message) comments.push({ annotation: a, message: event.message });
  }

  if (batches.length + answers.length + reopens.length + comments.length === 0) return EXIT_TIMEOUT;

  if (ctx.json) {
    json(io, { cursor, batches, answers, reopens, comments, events });
  } else {
    const blocks = [
      ...batches.map((b) => renderBatchMarkdown(b.batch, b.annotations, opts).trimEnd()),
      ...answers.map((a) => renderAnswerMarkdown(a).trimEnd()),
      ...reopens.map((a) => renderReopenMarkdown(a, a.batch).trimEnd()),
      ...comments.map((c) => renderCommentMarkdown(c.annotation, c.message).trimEnd()),
    ];
    io.out(`${blocks.join('\n\n')}\n\ncursor: ${cursor}`);
  }

  if (!flagBool(args, 'no-cursor')) await writeCursor(ctx.dir, ctx.agent, cursor);
  return EXIT_OK;
}

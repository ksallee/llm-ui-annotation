import {
  AGENT_VERBS_FOOTER,
  PROTOCOL_VERSION,
  renderAnnotationMarkdown,
  STATUSES,
  type Annotation,
  type RouteSummary,
  type Status,
} from '@llm-ui-annotation/core';
import { renderLevel, type Args } from '../args.js';
import type { Context } from '../context.js';
import { readCursor, cursorPath } from '../cursor.js';
import { EXIT_OK } from '../errors.js';
import { json, type Io } from '../output.js';
import { resolveMany } from '../resolve.js';
import { countByStatus } from '../store.js';

export const PENDING_STATUSES: readonly Status[] = ['sent', 'acknowledged', 'question'];

function byNumber(a: Annotation, b: Annotation): number {
  return a.number - b.number;
}

function groupByRoute(annotations: readonly Annotation[]): [string, Annotation[]][] {
  const map = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const list = map.get(a.route);
    if (list) list.push(a);
    else map.set(a.route, [a]);
  }
  return [...map.entries()]
    .map(([route, list]): [string, Annotation[]] => [route, list.sort(byNumber)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** `2 sent, 1 review`, over the statuses actually present. */
function tally(counts: RouteSummary['counts']): string {
  return STATUSES.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(', ');
}

export async function pending(ctx: Context, args: Args, io: Io): Promise<number> {
  const all = await ctx.store.annotations();
  const items = all.filter(
    (a) =>
      PENDING_STATUSES.includes(a.status) && (ctx.route === undefined || a.route === ctx.route),
  );
  if (ctx.json) {
    json(io, { count: items.length, annotations: items.sort(byNumber) });
    return EXIT_OK;
  }
  if (items.length === 0) {
    io.out('No pending annotations.');
    return EXIT_OK;
  }
  const opts = { level: renderLevel(args), dir: ctx.dir };
  const blocks: string[] = [];
  for (const [route, list] of groupByRoute(items)) {
    blocks.push(
      `## ${route}  ·  ${list.length} item${list.length === 1 ? '' : 's'}  ·  ${tally(countByStatus(list))}`,
    );
    for (const a of list) blocks.push(renderAnnotationMarkdown(a, opts));
  }
  blocks.push(AGENT_VERBS_FOOTER);
  io.out(blocks.join('\n\n'));
  return EXIT_OK;
}

export async function show(ctx: Context, args: Args, io: Io): Promise<number> {
  const all = await ctx.store.annotations();
  const items = resolveMany(all, args.positionals, ctx.route);
  if (ctx.json) {
    json(io, { annotations: items });
    return EXIT_OK;
  }
  const opts = { level: renderLevel(args, 'detailed'), dir: ctx.dir };
  io.out(items.map((a) => renderAnnotationMarkdown(a, opts)).join('\n\n'));
  return EXIT_OK;
}

export async function routes(ctx: Context, _args: Args, io: Io): Promise<number> {
  const summaries = await ctx.store.routes();
  if (ctx.json) {
    json(io, { routes: summaries });
    return EXIT_OK;
  }
  if (summaries.length === 0) {
    io.out('No routes yet.');
    return EXIT_OK;
  }
  const width = Math.max(...summaries.map((s) => s.route.length));
  io.out(
    summaries
      .map((s) => {
        const total = STATUSES.reduce((n, k) => n + s.counts[k], 0);
        const parts = tally(s.counts);
        return `${s.route.padEnd(width)}  ${total} item${total === 1 ? '' : 's'}${parts === '' ? '' : `  ·  ${parts}`}`;
      })
      .join('\n'),
  );
  return EXIT_OK;
}

export async function doctor(ctx: Context, _args: Args, io: Io): Promise<number> {
  const seq = await ctx.store.lastSeq();
  const cursor = await readCursor(ctx.dir, ctx.agent);
  const annotations = await ctx.store.annotations();
  const report = {
    dir: ctx.dir,
    transport: ctx.store.kind,
    server: ctx.server ? { base: ctx.server.base, pid: ctx.server.info.pid } : null,
    protocolVersion: PROTOCOL_VERSION,
    agent: ctx.agent,
    cursor,
    lastSeq: seq,
    annotations: annotations.length,
    pending: annotations.filter((a) => PENDING_STATUSES.includes(a.status)).length,
  };
  if (ctx.json) {
    json(io, report);
    return EXIT_OK;
  }
  io.out(
    [
      `dir:      ${report.dir}`,
      `server:   ${ctx.server ? `${ctx.server.base} (pid ${ctx.server.info.pid})` : 'not running — writing files directly'}`,
      `protocol: ${report.protocolVersion}`,
      `cursor:   ${cursor} of ${seq}  (${cursorPath(ctx.dir, ctx.agent)})`,
      `items:    ${report.annotations} total, ${report.pending} waiting on the agent`,
    ].join('\n'),
  );
  return EXIT_OK;
}

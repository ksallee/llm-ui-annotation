import {
  AGENT_VERBS_FOOTER,
  PROTOCOL_VERSION,
  renderAnnotationMarkdown,
  STATUSES,
  type Annotation,
  type RenderLevel,
  type Status,
} from '@llm-ui-annotation/core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { flagBool, flagString, type Args } from '../args.js';
import type { Context } from '../context.js';
import { readCursor, cursorPath } from '../cursor.js';
import { CliError, EXIT_OK } from '../errors.js';
import { json, type Io } from '../output.js';
import { resolveMany, resolveOne } from '../resolve.js';

const LEVELS: readonly RenderLevel[] = ['compact', 'standard', 'detailed'];
export const PENDING_STATUSES: readonly Status[] = ['sent', 'acknowledged', 'question'];

export function renderLevel(args: Args, fallback: RenderLevel = 'standard'): RenderLevel {
  const value = flagString(args, 'level');
  if (value === undefined) return fallback;
  if (!(LEVELS as readonly string[]).includes(value)) {
    throw new CliError(`--level must be one of ${LEVELS.join(', ')}`);
  }
  return value as RenderLevel;
}

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

function tally(annotations: readonly Annotation[]): string {
  return STATUSES.filter((s) => annotations.some((a) => a.status === s))
    .map((s) => `${annotations.filter((a) => a.status === s).length} ${s}`)
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
    blocks.push(`## ${route}  ·  ${list.length} item${list.length === 1 ? '' : 's'}  ·  ${tally(list)}`);
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
        const parts = STATUSES.filter((k) => s.counts[k] > 0).map((k) => `${s.counts[k]} ${k}`);
        return `${s.route.padEnd(width)}  ${total} item${total === 1 ? '' : 's'}${parts.length > 0 ? `  ·  ${parts.join(', ')}` : ''}`;
      })
      .join('\n'),
  );
  return EXIT_OK;
}

export async function screenshot(ctx: Context, args: Args, io: Io): Promise<number> {
  const all = await ctx.store.annotations();
  const [token] = args.positionals;
  if (token === undefined) throw new CliError('missing <id>');
  const a = resolveOne(all, token, ctx.route);
  const rel = a.target.kind === 'page' ? a.target.screenshot : null;
  if (rel === null) throw new CliError(`#${a.number} has no screenshot`);
  const path = join(ctx.dir, rel);
  if (ctx.json) json(io, { id: a.id, number: a.number, path });
  else io.out(path);
  if (flagBool(args, 'open')) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [path], { detached: true, stdio: 'ignore' }).unref();
  }
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

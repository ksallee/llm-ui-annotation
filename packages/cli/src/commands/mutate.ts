import { formatBytes, type Annotation, type Attachment, type NewMessage, type Status } from '@llm-ui-annotation/core';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { flagString, type Args } from '../args.js';
import type { Context } from '../context.js';
import { CliError, EXIT_OK } from '../errors.js';
import { json, statusLine, type Io } from '../output.js';
import { resolveMany, resolveOne } from '../resolve.js';

function note(a: Annotation): string | undefined {
  return a.resolution ? a.resolution.kind : undefined;
}

function report(ctx: Context, io: Io, results: Annotation[]): number {
  if (ctx.json) json(io, { annotations: results });
  else io.out(results.map((a) => statusLine(a.number, a.status, note(a))).join('\n'));
  return EXIT_OK;
}

async function moveAll(
  ctx: Context,
  tokens: readonly string[],
  to: Status,
  message?: (a: Annotation) => NewMessage,
): Promise<Annotation[]> {
  const all = await ctx.store.annotations();
  const items = resolveMany(all, tokens, ctx.route);
  const out: Annotation[] = [];
  for (const a of items) out.push(await ctx.store.transition(a, to, 'agent', message?.(a)));
  return out;
}

export async function ack(ctx: Context, args: Args, io: Io): Promise<number> {
  return report(ctx, io, await moveAll(ctx, args.positionals, 'acknowledged'));
}

function textArg(args: Args, flag: string, from: number): string {
  const value = flagString(args, flag) ?? args.positionals.slice(from).join(' ').trim();
  if (value === '') throw new CliError(`missing --${flag} "<text>"`);
  return value;
}

export async function ask(ctx: Context, args: Args, io: Io): Promise<number> {
  const [id] = args.positionals;
  if (id === undefined) throw new CliError('usage: annot ask <id> "<question>"');
  const text = textArg(args, 'question', 1);
  return report(
    ctx,
    io,
    await moveAll(ctx, [id], 'question', () => ({ role: 'agent', kind: 'question', text })),
  );
}

export async function done(ctx: Context, args: Args, io: Io): Promise<number> {
  const summary = flagString(args, 'summary');
  if (summary === undefined || summary.trim() === '') {
    throw new CliError('usage: annot done <id…> --summary "<what changed>"');
  }
  return report(
    ctx,
    io,
    await moveAll(ctx, args.positionals, 'review', () => ({
      role: 'agent',
      kind: 'summary',
      text: summary,
    })),
  );
}

export async function decline(ctx: Context, args: Args, io: Io): Promise<number> {
  const reason = flagString(args, 'reason');
  if (reason === undefined || reason.trim() === '') {
    throw new CliError('usage: annot decline <id…> --reason "<why>"');
  }
  return report(
    ctx,
    io,
    await moveAll(ctx, args.positionals, 'review', () => ({
      role: 'agent',
      kind: 'decline',
      text: reason,
    })),
  );
}

export async function reply(ctx: Context, args: Args, io: Io): Promise<number> {
  const [id] = args.positionals;
  if (id === undefined) throw new CliError('usage: annot reply <id> "<text>"');
  const text = textArg(args, 'text', 1);
  const all = await ctx.store.annotations();
  const a = resolveOne(all, id, ctx.route);
  const next = await ctx.store.appendMessage(a, { role: 'agent', kind: 'comment', text });
  if (ctx.json) json(io, { annotations: [next] });
  else io.out(statusLine(next.number, next.status, 'comment'));
  return EXIT_OK;
}

/** `annot attach <id> <file…>`: hand a file back to the user. */
export async function attach(ctx: Context, args: Args, io: Io): Promise<number> {
  const [token, ...files] = args.positionals;
  if (token === undefined || files.length === 0) {
    throw new CliError('usage: annot attach <id> <file…>');
  }
  const all = await ctx.store.annotations();
  let a = resolveOne(all, token, ctx.route);

  const added: Attachment[] = [];
  for (const file of files) {
    const path = isAbsolute(file) ? file : resolve(process.cwd(), file);
    const bytes = await readFile(path).catch(() => {
      throw new CliError(`cannot read ${file}`);
    });
    const result = await ctx.store.attach(a, bytes, basename(path));
    a = result.annotation;
    added.push(result.attachment);
  }

  if (ctx.json) {
    json(io, { annotations: [a], attachments: added });
    return EXIT_OK;
  }
  io.out(
    added
      .flatMap((x) => [
        `#${a.number} attached ${x.name} (${x.type}, ${formatBytes(x.bytes)})`,
        `  ${join(ctx.dir, x.path)}`,
      ])
      .join('\n'),
  );
  return EXIT_OK;
}

import type { RenderLevel } from '@llm-ui-annotation/core';
import { CliError } from './errors.js';

export interface Args {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

const BOOLEAN_FLAGS = new Set([
  'json',
  'help',
  'version',
  'from-now',
  'claude-md',
  'gitignore',
  'no-http',
  'no-cursor',
]);

/** Split `argv` into a command, its positionals and its flags. */
export function parseArgs(argv: readonly string[]): Args {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '-h') {
      flags['help'] = true;
      continue;
    }
    if (arg === '-v') {
      flags['version'] = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    if (BOOLEAN_FLAGS.has(body)) {
      flags[body] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new CliError(`--${body} needs a value`);
    flags[body] = next;
    i++;
  }

  const [command = '', ...rest] = positionals;
  return { command, positionals: rest, flags };
}

export function flagString(args: Args, name: string): string | undefined {
  const value = args.flags[name];
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') throw new CliError(`--${name} needs a value`);
  return value;
}

export function flagBool(args: Args, name: string): boolean {
  return args.flags[name] === true || args.flags[name] === 'true';
}

const LEVELS: readonly RenderLevel[] = ['compact', 'standard', 'detailed'];

/** The `--level` flag, or `fallback`. */
export function renderLevel(args: Args, fallback: RenderLevel = 'standard'): RenderLevel {
  const value = flagString(args, 'level');
  if (value === undefined) return fallback;
  if (!(LEVELS as readonly string[]).includes(value)) {
    throw new CliError(`--level must be one of ${LEVELS.join(', ')}`);
  }
  return value as RenderLevel;
}

export function flagNumber(args: Args, name: string): number | undefined {
  const value = flagString(args, name);
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new CliError(`--${name} must be a number, got ${value}`);
  return n;
}

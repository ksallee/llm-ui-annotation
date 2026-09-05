import { DEFAULT_BASE_PATH, DEFAULT_DIR, PROTOCOL_VERSION, type ServerInfo } from '@llm-ui-annotation/core';
import { findAnnotationsDir, readServerInfo } from '@llm-ui-annotation/core/node';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Args } from './args.js';
import { flagBool, flagString } from './args.js';
import { CliError } from './errors.js';
import { FileStore, HttpStore, type Store } from './store.js';

export const HEALTH_TIMEOUT_MS = 500;

export interface ServerHandle {
  info: ServerInfo;
  base: string;
}

export interface Context {
  dir: string;
  /** Project root: the parent of the annotations dir. */
  root: string;
  store: Store;
  server: ServerHandle | null;
  json: boolean;
  agent: string;
  route: string | undefined;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The running dev server, or null when `server.json` is stale or unanswered. */
export async function probeServer(dir: string): Promise<ServerHandle | null> {
  const info = await readServerInfo(dir);
  if (!info || !alive(info.pid)) return null;
  const base = `http://127.0.0.1:${info.port}${info.basePath || DEFAULT_BASE_PATH}`;
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; protocolVersion?: number };
    return body.ok === true && body.protocolVersion === PROTOCOL_VERSION ? { info, base } : null;
  } catch {
    return null;
  }
}

/** Where `--dir` or `ANNOT_DIR` point, whether or not it exists yet. */
export function namedDir(args: Args): string | null {
  const explicit = flagString(args, 'dir') ?? process.env['ANNOT_DIR'];
  return explicit !== undefined && explicit !== '' ? resolve(explicit) : null;
}

/** An existing annotations dir: the one named, else the nearest at or above cwd. */
export async function locateDir(args: Args): Promise<string | null> {
  const named = namedDir(args);
  if (named !== null) return existsSync(named) ? named : null;
  return findAnnotationsDir(process.cwd(), DEFAULT_DIR);
}

export async function openContext(args: Args, warn: (line: string) => void): Promise<Context> {
  const dir = await locateDir(args);
  if (dir === null) {
    const where = namedDir(args) ?? `at or above ${process.cwd()}`;
    throw new CliError(`no annotations dir ${where} — run \`annot init\` in the project root`);
  }
  const server = flagBool(args, 'no-http') ? null : await probeServer(dir);
  if (server === null && !flagBool(args, 'no-http')) {
    warn('(dev server not running, writing files directly)');
  }
  return {
    dir,
    root: dirname(dir),
    store: server ? new HttpStore(dir, server.base) : new FileStore(dir),
    server,
    json: flagBool(args, 'json'),
    agent: flagString(args, 'agent') ?? process.env['ANNOT_AGENT'] ?? 'agent',
    route: flagString(args, 'route'),
  };
}

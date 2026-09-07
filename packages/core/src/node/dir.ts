/** Locating the annotations dir and the server info inside it. */

import { readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DEFAULT_DIR, ROUTES_DIR, SERVER_FILE, type ServerInfo } from '../protocol/paths.js';
import { ensureDir, isEnoent, readJsonOrNull, writeJson } from './fs.js';

export function serverInfoPath(dir: string): string {
  return join(dir, SERVER_FILE);
}

export async function readServerInfo(dir: string): Promise<ServerInfo | null> {
  return readJsonOrNull<ServerInfo>(serverInfoPath(dir));
}

export async function writeServerInfo(dir: string, info: ServerInfo): Promise<void> {
  await writeJson(serverInfoPath(dir), info);
}

export async function removeServerInfo(dir: string): Promise<void> {
  await rm(serverInfoPath(dir), { force: true });
}

/** Create the directory skeleton. */
export async function initDir(dir: string): Promise<void> {
  await ensureDir(join(dir, ROUTES_DIR));
}

/** Nearest annotations dir at or above `from`, or null. */
export async function findAnnotationsDir(
  from: string,
  name: string = DEFAULT_DIR,
): Promise<string | null> {
  let current = isAbsolute(from) ? from : resolve(from);
  for (;;) {
    const candidate = join(current, name);
    try {
      await readdir(candidate);
      return candidate;
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

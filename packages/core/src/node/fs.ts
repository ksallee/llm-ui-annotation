/** Atomic writes, and reads that answer null instead of throwing on a missing file. */

import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

let counter = 0;

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Write via a sibling tmp file and rename. */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(dirname(file));
  const tmp = `${file}.${process.pid}.${counter++}.tmp`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** File contents, or null when it does not exist. */
export async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

/** Parsed JSON, or null when the file is missing or unparseable. */
export async function readJsonOrNull<T>(file: string): Promise<T | null> {
  const text = await readTextOrNull(file);
  if (text === null || text.trim() === '') return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function appendLine(file: string, line: string): Promise<void> {
  await ensureDir(dirname(file));
  await appendFile(file, line);
}

export function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';
}

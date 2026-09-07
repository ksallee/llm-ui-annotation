/** Screenshots and attachments: the binary files an annotation points at. */

import { readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { attachmentDir, attachmentFile } from '../protocol/attachments.js';
import { screenshotFile } from '../protocol/paths.js';
import { isEnoent, writeFileAtomic } from './fs.js';

/** `join`, refusing a path that would land outside `dir`. */
function safeJoin(dir: string, rel: string): string {
  const file = join(dir, rel);
  const inside = relative(resolve(dir), resolve(file));
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`path escapes the annotations dir: ${rel}`);
  }
  return file;
}

export function screenshotPath(dir: string, id: string): string {
  return safeJoin(dir, screenshotFile(id));
}

/** Write a screenshot and return its path relative to `dir`. */
export async function writeScreenshot(dir: string, id: string, png: Uint8Array): Promise<string> {
  await writeFileAtomic(screenshotPath(dir, id), png);
  return screenshotFile(id);
}

export async function removeScreenshot(dir: string, id: string): Promise<void> {
  await rm(screenshotPath(dir, id), { force: true });
}

export function attachmentDirPath(dir: string, annotationId: string): string {
  return safeJoin(dir, attachmentDir(annotationId));
}

export function attachmentPath(dir: string, relative: string): string {
  return safeJoin(dir, relative);
}

/** Write an attachment and return its path relative to `dir`. */
export async function writeAttachment(
  dir: string,
  annotationId: string,
  attachmentId: string,
  ext: string,
  bytes: Uint8Array,
): Promise<string> {
  const relative = attachmentFile(annotationId, attachmentId, ext);
  await writeFileAtomic(safeJoin(dir, relative), bytes);
  return relative;
}

export async function readAttachment(dir: string, relative: string): Promise<Buffer | null> {
  try {
    return await readFile(safeJoin(dir, relative));
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

export async function removeAttachment(dir: string, relative: string): Promise<void> {
  await rm(safeJoin(dir, relative), { force: true });
}

/** Drop the whole `attachments/<annotationId>/` directory. */
export async function removeAttachments(dir: string, annotationId: string): Promise<void> {
  await rm(attachmentDirPath(dir, annotationId), { recursive: true, force: true });
}

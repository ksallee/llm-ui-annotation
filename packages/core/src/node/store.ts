/** Route files and batch files under the annotations dir. */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { nowIso } from '../model/id.js';
import type { Annotation, Batch } from '../model/types.js';
import {
  ROUTES_DIR,
  batchFile,
  emptyRouteFile,
  routeFile,
  routeFileFromSlug,
  type RouteFile,
} from '../protocol/paths.js';
import { isEnoent, readJsonOrNull, writeJson } from './fs.js';

export function routePath(dir: string, route: string): string {
  return join(dir, routeFile(route));
}

/** Route file for `route`; an empty one when it does not exist yet. */
export async function readRoute(dir: string, route: string): Promise<RouteFile> {
  const file = await readJsonOrNull<RouteFile>(routePath(dir, route));
  return file ?? emptyRouteFile(route, nowIso());
}

export async function readRouteBySlug(dir: string, routeSlug: string): Promise<RouteFile | null> {
  return readJsonOrNull<RouteFile>(join(dir, routeFileFromSlug(routeSlug)));
}

export async function writeRoute(dir: string, file: RouteFile): Promise<void> {
  await writeJson(routePath(dir, file.route), file);
}

/** Slugs of every route file on disk. */
export async function listRouteSlugs(dir: string): Promise<string[]> {
  try {
    const names = await readdir(join(dir, ROUTES_DIR));
    return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -'.json'.length)).sort();
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
}

export async function listRoutes(dir: string): Promise<RouteFile[]> {
  const slugs = await listRouteSlugs(dir);
  const files = await Promise.all(slugs.map((s) => readRouteBySlug(dir, s)));
  return files.filter((f): f is RouteFile => f !== null);
}

/** Every annotation across every route file. */
export async function readAllAnnotations(dir: string): Promise<Annotation[]> {
  const files = await listRoutes(dir);
  return files.flatMap((f) => f.annotations);
}

export async function readBatch(dir: string, id: string): Promise<Batch | null> {
  return readJsonOrNull<Batch>(join(dir, batchFile(id)));
}

export async function writeBatch(dir: string, batch: Batch): Promise<void> {
  await writeJson(join(dir, batchFile(batch.id)), batch);
}

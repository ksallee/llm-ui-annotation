import { slug } from './slug.js';
import type { Annotation, ProtocolVersion } from '../model/types.js';

export const DEFAULT_DIR = '.annotations';
export const DEFAULT_BASE_PATH = '/__annot';

export const ROUTES_DIR = 'routes';
export const BATCHES_DIR = 'batches';
export const EVENTS_FILE = 'events.jsonl';
export const SERVER_FILE = 'server.json';

export interface RouteFile {
  route: string;
  updatedAt: string;
  nextNumber: number;
  annotations: Annotation[];
}

export interface ServerInfo {
  port: number;
  pid: number;
  startedAt: string;
  protocolVersion: ProtocolVersion;
  basePath: string;
}

/** `routes/<slug>.json`, relative to the annotations dir. */
export function routeFile(route: string): string {
  return `${ROUTES_DIR}/${slug(route)}.json`;
}

/** `routes/<slug>.json` for an already-computed slug. */
export function routeFileFromSlug(routeSlug: string): string {
  return `${ROUTES_DIR}/${routeSlug}.json`;
}

/** `batches/<id>.json`, relative to the annotations dir. */
export function batchFile(id: string): string {
  return `${BATCHES_DIR}/${id}.json`;
}

export function emptyRouteFile(route: string, updatedAt: string): RouteFile {
  return { route, updatedAt, nextNumber: 1, annotations: [] };
}

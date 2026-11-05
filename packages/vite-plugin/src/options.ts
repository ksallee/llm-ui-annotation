import { isAbsolute, resolve } from 'node:path';
import { DEFAULT_BASE_PATH, DEFAULT_DIR } from '@llm-ui-annotation/core';

export type Scheme = 'light' | 'dark' | 'auto';
export type WatchMode = 'native' | 'poll';

export interface AnnotationsOptions {
  /** Storage directory. Default `process.env.ANNOT_DIR` when set, else `.annotations` at the Vite root. */
  dir?: string;
  /** Add the overlay to every served HTML page. */
  inject?: boolean;
  /** Any CSS color; handed to the overlay. */
  accent?: string;
  scheme?: Scheme;
  /** Route key for a URL when the browser did not send one. */
  routeKey?: (url: string) => string;
  basePath?: string;
  /** Page URL globs to inject on; every page when omitted. */
  include?: string[];
  watch?: WatchMode;
  /** The markdown file behind a route, relative to the Vite root; enables `POST /replace` for it. */
  sourceFile?: (route: string) => string | null | undefined;
}

export interface ResolvedOptions {
  dir: string;
  inject: boolean;
  accent: string | null;
  scheme: Scheme;
  routeKey: (url: string) => string;
  basePath: string;
  include: string[] | null;
  watch: WatchMode;
  root: string;
  sourceFile: ((route: string) => string | null | undefined) | null;
}

/** Pathname of `url`, which may be absolute or server-relative. */
export function defaultRouteKey(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim().replace(/\/+$/, '');
  if (trimmed === '') return DEFAULT_BASE_PATH;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function resolveOptions(options: AnnotationsOptions, root: string): ResolvedOptions {
  const configured = options.dir ?? process.env['ANNOT_DIR'] ?? DEFAULT_DIR;
  return {
    dir: isAbsolute(configured) ? configured : resolve(root, configured),
    inject: options.inject ?? true,
    accent: options.accent ?? null,
    scheme: options.scheme ?? 'auto',
    routeKey: options.routeKey ?? defaultRouteKey,
    basePath: normalizeBasePath(options.basePath ?? DEFAULT_BASE_PATH),
    include: options.include && options.include.length > 0 ? [...options.include] : null,
    watch: options.watch ?? 'native',
    root,
    sourceFile: options.sourceFile ?? null,
  };
}

/** Glob match over a URL path, supporting `?`, `*` and `**`. */
export function matchGlob(pattern: string, path: string): boolean {
  let rx = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === '*') {
      if (pattern.charAt(i + 1) === '*') {
        rx += '.*';
        i++;
      } else {
        rx += '[^/]*';
      }
    } else if (c === '?') {
      rx += '[^/]';
    } else {
      rx += c.replace(/[.+^${}()|[\]\\]/, '\\$&');
    }
  }
  return new RegExp(`^${rx}$`).test(path);
}

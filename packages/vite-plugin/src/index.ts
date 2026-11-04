import { rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEFAULT_DIR, nowIso, PROTOCOL_VERSION } from '@llm-ui-annotation/core';
import { readTextOrNull, removeServerInfo, serverInfoPath, writeServerInfo } from '@llm-ui-annotation/core/node';
import type { Plugin } from 'vite';
import { createApi } from './api.js';
import { AUTO_MODULE, autoModuleSource, RESOLVED_VIRTUAL_ID, scriptSrc, VIRTUAL_ID } from './inject.js';
import { matchGlob, resolveOptions, type AnnotationsOptions, type ResolvedOptions } from './options.js';
import { Store } from './store.js';
import { startWatching } from './watch.js';

export type { AnnotationsOptions, ResolvedOptions, Scheme, WatchMode } from './options.js';
export { GLOBAL_HOT, GLOBAL_OPTIONS, VIRTUAL_ID, type OverlayOptions } from './inject.js';

/** Dev-server side of llm-ui-annotation: storage, HTTP API, SSE, websocket push and overlay injection. */
export function annotations(options: AnnotationsOptions = {}): Plugin {
  let resolved: ResolvedOptions;
  let base = '/';
  let root = process.cwd();
  let serve = false;
  let closeServer: (() => void) | null = null;
  let openStore: Store | null = null;

  return {
    name: 'llm-ui-annotation',

    configResolved(config) {
      resolved = resolveOptions(options, config.root);
      base = config.base;
      root = config.root;
      serve = config.command === 'serve';
    },

    resolveId(id) {
      if (id === VIRTUAL_ID || id === RESOLVED_VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      const available = (await this.resolve(AUTO_MODULE, undefined, { skipSelf: true })) !== null;
      return autoModuleSource(resolved, available);
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!serve || !resolved.inject) return;
        const path = ctx.path || ctx.originalUrl || '/';
        if (resolved.include && !resolved.include.some((glob) => matchGlob(glob, path))) return;
        return {
          html,
          tags: [{ tag: 'script', attrs: { type: 'module', src: scriptSrc(base) }, injectTo: 'body' }],
        };
      },
    },

    configureServer(server) {
      const logger = server.config.logger;
      const store = new Store(resolved.dir);
      openStore = store;
      const fail = (what: string) => (err: unknown): void =>
        logger.error(`[annot] ${what}: ${err instanceof Error ? err.message : String(err)}`);
      const ready = store.start();

      server.middlewares.use(createApi(store, resolved, () => ready, logger));

      const unsubscribe = store.onChange((change) => {
        if (change.kind === 'annotation') {
          server.ws.send({ type: 'custom', event: 'annot:annotation', data: change.annotation });
        } else if (change.kind === 'deleted') {
          server.ws.send({ type: 'custom', event: 'annot:deleted', data: { id: change.id, route: change.route } });
        } else {
          server.ws.send({ type: 'custom', event: 'annot:route', data: change.file });
        }
      });

      let stopWatching: (() => void) | null = null;

      const cleanupSync = (): void => {
        try {
          rmSync(serverInfoPath(resolved.dir), { force: true });
        } catch {
          // the directory may already be gone
        }
      };
      process.once('SIGINT', cleanupSync);
      process.once('SIGTERM', cleanupSync);
      process.on('exit', cleanupSync);

      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        unsubscribe();
        stopWatching?.();
        process.off('SIGINT', cleanupSync);
        process.off('SIGTERM', cleanupSync);
        process.off('exit', cleanupSync);
        void removeServerInfo(resolved.dir).catch(cleanupSync);
      };
      closeServer = close;

      void ready.then(() => {
        if (closed) return;
        stopWatching = startWatching(store, resolved.watch, fail('watcher'));
      }, fail('storage'));

      const httpServer = server.httpServer;
      const announce = async (): Promise<void> => {
        const address = httpServer?.address();
        const port =
          typeof address === 'object' && address !== null ? address.port : (server.config.server.port ?? 5173);
        await writeServerInfo(resolved.dir, {
          port,
          pid: process.pid,
          startedAt: nowIso(),
          protocolVersion: PROTOCOL_VERSION,
          basePath: resolved.basePath,
        });
        await ready;
        logger.info(
          `[annot] ${relative(root, resolved.dir) || resolved.dir} · port ${port} · ${store.routeCount} routes`,
        );
        await hintGitignore(root, resolved, (message) => logger.warn(message));
      };

      if (httpServer) {
        if (httpServer.listening) void announce().catch(fail('startup'));
        else httpServer.once('listening', () => void announce().catch(fail('startup')));
        httpServer.once('close', close);
      }
    },

    async closeBundle() {
      closeServer?.();
      closeServer = null;
      // The dev server is gone but a write may still be in flight; the directory has to be whole.
      await openStore?.settle();
      openStore = null;
    },
  };
}

async function hintGitignore(
  root: string,
  options: ResolvedOptions,
  warn: (message: string) => void,
): Promise<void> {
  const inside = relative(root, options.dir);
  if (inside === '' || inside.startsWith('..')) return;
  const text = await readTextOrNull(join(root, '.gitignore'));
  if (text === null) return;
  const wanted = inside.split('/')[0] ?? DEFAULT_DIR;
  const ignored = text
    .split('\n')
    .map((line) => line.trim().replace(/^\/+|\/+$/g, ''))
    .includes(wanted);
  if (!ignored) warn(`[annot] ${wanted}/ is not in .gitignore; run \`annot init --gitignore\``);
}

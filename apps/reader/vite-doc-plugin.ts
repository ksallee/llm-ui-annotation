import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Plugin } from 'vite';
import {
  DOC_ENDPOINT,
  DOC_EVENT,
  DOC_META_ID,
  type DocMeta,
  type DocPayload,
} from './src/doc-protocol.js';

export interface DocPluginOptions {
  /** Markdown file to serve. Default `process.env.DOC`, else `docs/sample.md` under the Vite root. */
  doc?: string;
}

/** Absolute path of the document the reader serves. */
export function resolveDoc(root: string, doc?: string): string {
  return resolve(root, doc ?? process.env['DOC'] ?? 'docs/sample.md');
}

/** Route key for a document: `/doc/<basename>`. */
export function docRoute(path: string): string {
  return `/doc/${basename(path)}`;
}

async function payload(path: string): Promise<DocPayload> {
  return {
    path,
    name: basename(path),
    route: docRoute(path),
    markdown: await readFile(path, 'utf8'),
  };
}

/** Serves the markdown document at `/__doc` and pushes it over the HMR socket when it changes. */
export function readerDoc(options: DocPluginOptions = {}): Plugin {
  let path = '';

  return {
    name: 'reader-doc',

    configResolved(config) {
      path = resolveDoc(config.root, options.doc);
    },

    transformIndexHtml() {
      const meta: DocMeta = { path, name: basename(path), route: docRoute(path) };
      return [
        {
          tag: 'script',
          attrs: { type: 'application/json', id: DOC_META_ID },
          children: JSON.stringify(meta).replaceAll('<', '\\u003c'),
          injectTo: 'head',
        },
      ];
    },

    configureServer(server) {
      server.middlewares.use(DOC_ENDPOINT, (_req, res) => {
        void payload(path).then(
          (body) => {
            res.setHeader('content-type', 'application/json');
            res.setHeader('cache-control', 'no-store');
            res.end(JSON.stringify(body));
          },
          (error: unknown) => {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: String(error) }));
          },
        );
      });

      server.watcher.add(path);
      const push = (changed: string): void => {
        if (resolve(changed) !== path) return;
        void payload(path).then(
          (data) => server.ws.send({ type: 'custom', event: DOC_EVENT, data }),
          () => {},
        );
      };
      server.watcher.on('change', push);
      server.watcher.on('add', push);
      server.config.logger.info(`  reader doc  ${path}`);
    },
  };
}

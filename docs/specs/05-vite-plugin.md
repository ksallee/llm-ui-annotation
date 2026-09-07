# 05 · Vite plugin

Owner: `packages/vite-plugin`. Node 22, ESM, deps allowed: `vite` (peer ^6 || ^7 || ^8). No database, files only.

```ts
import { annotations } from '@llm-ui-annotation/vite-plugin';
export default defineConfig({ plugins: [svelte(), annotations({ dir: '.annotations', inject: true, accent: '#2C8A85' })] });
```

Options: `dir` (default: `process.env.ANNOT_DIR` when set, else `.annotations` at `config.root`; the env override is what lets `tools/qa.mjs` give each headless run its own storage so parallel worktrees do not write over each other), `inject` (default true: add the overlay to every HTML page in dev), `accent`, `scheme`, `routeKey: (url) => string` (default pathname), `basePath` (default `/__annot`), `include: string[]` of page URL globs to inject on.

## Responsibilities

1. **Storage** — sole writer of `<dir>` while the dev server runs. Implements the file layout from spec 01: `routes/`, `batches/`, `events.jsonl`, `screenshots/`, `server.json`. Atomic writes. In-memory cache of route files with `mtime` check so external edits (the CLI in fallback mode, or a human) are noticed. A route file that is unparseable, or parses to something that is not a route file, is ignored — the last good copy stays served and neither startup nor a request fails.
2. **HTTP API** — every endpoint in spec 01 on `server.middlewares`. Body limit 20 MB for screenshots and attachments, 1 MB otherwise. Validate with `validateAnnotation` from core; reject with 400 and the problem list. Assign `number` from `nextNumber` per route. Emit events with `seq`.
3. **SSE** — `GET /__annot/events/stream?since=` keeps the connection open, replays events after `since`, then streams new ones; heartbeat comment every 15 s. Used by `annot watch`.
4. **Push to the overlay** — on any change (own writes or detected external writes), `server.ws.send({ type: 'custom', event: 'annot:annotation', data: Annotation })`, `annot:deleted`, or `annot:route` when a whole file changed. Use `fs.watch` on `<dir>/routes` and `<dir>/events.jsonl` with 100 ms debounce (fall back to polling every 500 ms on platforms where `fs.watch` is unreliable, detect via option `watch: 'native' | 'poll'`).
5. **Inject** — `transformIndexHtml` adds `<script type="module" src="/@id/__x00__virtual:annot-auto"></script>`; the virtual module imports `@llm-ui-annotation/svelte/auto` and passes options as `import.meta.env`-free JSON. Only when `command === 'serve'`. Never in build output.
6. **`server.json`** — written on `configureServer` with `{ port, pid, startedAt, protocolVersion, basePath }` after the server is listening (hook `httpServer.once('listening')`), deleted on `close`/SIGINT. The CLI reads it to find the server.
7. **Init side effects** — on first start, if `.gitignore` in `config.root` exists and lacks the dir, log a one-line hint (do not edit the file; `annot init` does that).

## Event ordering

Single process, single writer: hold an in-process mutex per route file (promise chain) so a POST and a transition for the same route serialize. `seq` is `lastSeq + 1`, read from the tail of `events.jsonl` at startup. Never rewrite `events.jsonl`; append only.

External writes from the CLI (fallback mode when the server is down) will have their own `seq` continuation because the CLI uses the same helper from core (`appendEvent(dir, event)` that reads the tail). When the server starts it re-reads the tail. If both ever write concurrently (shouldn't: the CLI prefers HTTP when `server.json` is fresh and the port answers), duplicate `seq` is tolerated by consumers (dedupe on `seq + annotationId + type`).

## Route files and multi-page hosts

The overlay sends `route` with every create; the plugin derives the slug and file. `GET /__annot/routes/:slug` returns `{ route, updatedAt, nextNumber, annotations }`. `GET /__annot/routes` lists routes with counts by status for the panel's "all routes" view.

## Screenshots

`POST /__annot/screenshots/:id` with `image/png` body → `<dir>/screenshots/<id>.png`, returns `{ path: 'screenshots/<id>.png' }`. Reject non-PNG. When an annotation is deleted (drafts only), delete its screenshot. A create or a `PATCH` carrying a `target.screenshot` the server never issued is refused with 400 by `validateAnnotation`: the CLI prints that path and the agent reads it, so it may only be a name this server produced.

## Attachments

`POST /__annot/annotations/:id/attachments?name=<encoded>[&by=user|agent]` with the raw file bytes →
`<dir>/attachments/<id>/<attachmentId>.<ext>`, returns the `Attachment`. `DELETE
/__annot/annotations/:id/attachments/:attachmentId` → `{ ok: true }`. `GET
/__annot/attachments/:id/:attachmentId` streams the file back. Both verbs emit `annotation.updated` and push
the annotation to the overlay; deleting a draft deletes its attachment directory along with its screenshot.

The type comes from the magic bytes, then from the extension of `?name`; the request's `Content-Type` is never
believed. 20 MB per file (the read aborts mid-stream with 413), 50 MB and 10 files per annotation. The stored
`path` is never joined with a request segment: every read rebuilds it from `isId`-checked ids plus the
extension for the recorded type.

### Why the write endpoints refuse ordinary content types

An earlier `POST /screenshots/:id` accepted `text/plain`, which is a CORS-simple content type, so any page the
developer had open could write files into the project. Every endpoint that takes a body now refuses
`text/plain`, `multipart/form-data` and `application/x-www-form-urlencoded` with 415, and refuses a foreign
`Origin` or `Sec-Fetch-Site` with 403. What is left needs a preflight, which this server does not answer.
Callers send the real MIME or `application/octet-stream`. The check runs once in the dispatcher, on every
route that is not a `GET`, so a new verb cannot forget it.

Attachments are served with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src
'none'; style-src 'unsafe-inline'; sandbox`, so an uploaded SVG cannot run script on the dev origin.

## Logging

Prefix `[annot]`. One line on start with the dir, port, and route count. One line per batch sent (`[annot] batch 01J8… sent, 3 items on /pricing`). Errors with the request path. Nothing per event.

## Decided during implementation

- `POST /annotations` is an upsert: a new id is `201` and `annotation.created`, a known id is `200` and `annotation.updated` (the overlay re-posts a draft it edited). `number` and `createdAt` are kept from the stored copy.
- `GET /routes/:slug` answers `200` with an empty `RouteFile` when the file does not exist, because a slug does not reverse to a route; `?route=` fills the `route` field. `GET /routes` returns `{ routes, summaries }`, the summaries carrying the per-status counts.
- `PATCH /annotations/:id` emits one `thread.message` by `user` — the event `annot watch` wakes on. A body carrying a `target` also emits `status.changed` when it returns a `review` drawing to `sent`.
- `POST /batches` emits one `status.changed` per draft it moves, then `batch.sent` carrying the batch. A reopen (`review|approved → sent` by the user) creates the new batch server-side and emits `status.changed` then `batch.sent`, so nothing else has to call `assignBatch`.
- An illegal transition is `409` with the allowed statuses in `problems`.
- `resolution` on a transition becomes a `summary` or `decline` message; an explicit `message` wins over it.
- `routeKey` is applied server-side to an annotation posted without a `route`. It cannot cross into the browser (it is a function and the virtual module is shared by every page), so the overlay computes its own route.
- The virtual module sets `globalThis.__ANNOT_OPTIONS__` and then imports `@llm-ui-annotation/svelte/auto`; when that package does not resolve it warns instead, so an app without the overlay still boots.

## Acceptance criteria

- Vitest with a real Vite dev server on a random port against a temp dir: create draft, list route, send batch (assert `events.jsonl` has `batch.sent` with the full batch, statuses flipped), transition via HTTP by `agent`, SSE stream delivers the events in order with `since`, external edit of a route file triggers `annot:route` on a fake ws client, `server.json` appears and disappears, screenshot round-trip.
- `transformIndexHtml` injects in serve and not in build (test both).
- Attachments: a PNG round-trips through POST and GET; a ZIP is refused with 415 naming the accepted list; a 21 MB body is refused with 413; a traversing `:id` or `:attachmentId` is refused with 400; a CORS-simple content type and a foreign `Origin` are refused; deleting a draft removes `attachments/<id>/`.
- Typecheck of options; README with the config snippet and the file layout.

# @llm-ui-annotation/vite-plugin

The dev-server side of llm-ui-annotation. It is the sole writer of `.annotations/` while the dev
server runs: it serves the wire API from spec 01, streams events over SSE, pushes changes to the
overlay on Vite's HMR socket, and injects the overlay into every served HTML page.

## Use

```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { annotations } from '@llm-ui-annotation/vite-plugin';

export default defineConfig({
  plugins: [svelte(), annotations({ accent: '#2C8A85' })],
});
```

| Option | Default | What it does |
|---|---|---|
| `dir` | `process.env.ANNOT_DIR`, else `.annotations` at the Vite root | Storage directory; a relative path resolves against the root. |
| `inject` | `true` | Add the overlay to every served HTML page. Never in build output. |
| `accent` | none | Any CSS color, handed to the overlay. |
| `scheme` | `'auto'` | `light`, `dark` or `auto`. |
| `routeKey` | pathname of the URL | Route for an annotation posted without one. |
| `basePath` | `'/__annot'` | Prefix for every endpoint. |
| `include` | every page | Page URL globs (`*`, `**`, `?`) to inject on. |
| `watch` | `'native'` | `native` uses `fs.watch`, `poll` stats every 500 ms. |

`ANNOT_DIR` is what lets `tools/qa.mjs` give each headless run its own storage, so parallel
worktrees never write over each other. An explicit `dir` wins over it.

## File layout

```
.annotations/
  server.json           { port, pid, startedAt, protocolVersion, basePath }, written once listening,
                        removed on close and on SIGINT/SIGTERM
  routes/<slug>.json    { route, updatedAt, nextNumber, annotations }
  batches/<id>.json     Batch
  events.jsonl          append-only, one Event per line, `seq` read from the tail at startup
  screenshots/<id>.png
```

## HTTP API

Every path is relative to `basePath`. JSON in and out, same origin, errors `{ error, problems? }`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | | `{ ok: true, protocolVersion, dir }` |
| GET | `/routes` | | `{ routes: string[], summaries: RouteSummary[] }` |
| GET | `/routes/:slug?route=` | | `RouteFile`, empty (200) when the file does not exist |
| POST | `/annotations` | `Annotation` (`draft` or `sent`) | `Annotation`, 201 on create and 200 on update |
| PATCH | `/annotations/:id` | `{ comment }` | `Annotation` |
| DELETE | `/annotations/:id` | | `{ ok: true }`, 409 unless the annotation is a draft |
| POST | `/annotations/:id/transition` | `{ to, by, message?, resolution? }` | `Annotation` |
| POST | `/batches` | `{ route, annotationIds, summary }` | `Batch`, 201 |
| GET | `/events?since=` | | `{ events: Event[] }` |
| GET | `/events/stream?since=` | | SSE, `id: <seq>` + one `Event` per frame, `: ping` every 15 s |
| POST | `/screenshots/:id` | `image/png` (20 MB cap) | `{ path }`, 201 |

Bodies are capped at 1 MB except screenshots. An illegal transition is 409 with the allowed statuses
in `problems`. `resolution: { kind: 'changed' \| 'declined', summary }` is written as a `summary` or
`decline` message on the thread; `message` wins when both are given. Reopening (`review|approved →
sent` by the user) clears the resolution and creates a fresh batch, so a `batch.sent` follows the
`status.changed`.

## Websocket

Custom events on Vite's HMR socket, for the overlay:

| Event | Payload |
|---|---|
| `annot:annotation` | `Annotation` — created, updated, patched, transitioned, screenshot attached |
| `annot:deleted` | `{ id, route }` |
| `annot:route` | `RouteFile` — a batch, or a file another writer changed |

## Injection

`transformIndexHtml` adds `<script type="module" src="/@id/__x00__virtual:annot-auto">` in serve
only. The virtual module sets `globalThis.__ANNOT_OPTIONS__ = { basePath, protocolVersion, accent?,
scheme }` and `globalThis.__ANNOT_HOT__ = import.meta.hot` — that second global is what puts the
overlay on the websocket instead of the 2 s poll — and then imports
`@llm-ui-annotation/svelte/auto`; when that package does not resolve it warns instead, so an app
without the overlay still boots.

When `modern-screenshot` resolves from the app, the module imports it too and sets
`globalThis.__ANNOT_DOM_TO_CANVAS__`, which is how page-mode screenshots get a backend. The overlay
cannot import the optional peer itself: a bare specifier it does not have breaks the host's module
graph, and one it does have never resolves in the browser.

## Test

```sh
pnpm --filter @llm-ui-annotation/vite-plugin test
```

Every case runs a real Vite dev server on a random port against a temp directory.

# 01 · Data model and file protocol

Owner: `packages/core/src/model/`, `packages/core/src/protocol/`. Zero runtime deps. This spec is frozen after merge; bump `protocolVersion` to change it.

## Goals

Give every other workstream a single vocabulary: what an annotation is, how it is anchored, how its status moves, what is written to disk and in which order, and how the browser and the agent both talk to it.

## Identifiers and time

- `id`: 26-char Crockford base32 ULID-like string generated client-side (10-char time prefix + 16 random). Provide `newId(now = Date.now())`. Sortable, no dependency; ids made in the same millisecond increment the random part so the order is strict. Also `isId`, `idTime`, `compareIds`, `nowIso`.
- All timestamps ISO 8601 UTC strings (`2026-09-05T18:24:41.048Z`).
- `protocolVersion: 2` (`PROTOCOL_VERSION`). Readers accept every version in `SUPPORTED_PROTOCOL_VERSIONS` — `[1, 2]` — so files written before multi-block highlights keep loading; a v1 text target simply has no `blocks`. `validateAnnotation` is the one place that decides. `attachments` (spec 11 §1) did **not** bump it: the field is additive and optional, so a v2 reader that predates it sees an annotation without attachments, which is a state it already handles.

## Types (TypeScript, exported from `@llm-ui-annotation/core`)

```ts
export type Mode = 'element' | 'text' | 'page';

export type Status =
  | 'draft'        // exists only in the browser until sent (immediate mode skips this)
  | 'sent'         // written to disk, waiting for the agent
  | 'acknowledged' // agent has seen it and is working
  | 'question'     // agent asked something, waiting for the user
  | 'review'       // agent finished (changed or declined), waiting for the user
  | 'approved';    // user accepted; highlight gone, kept in history

export interface Viewport { width: number; height: number; dpr: number; scrollX: number; scrollY: number }
export interface Rect { x: number; y: number; width: number; height: number }   // document coordinates, CSS px

export interface ElementRef {
  selector: string;            // shortest unique selector, see spec 02
  fallbacks: string[];         // alternative selectors, most specific first
  tag: string;                 // lowercase
  role: string | null;         // explicit or implicit ARIA role
  name: string;                // human label, e.g. button "Save"
  text: string;                // visible text, trimmed, max 200 chars
  rect: Rect;
  fixed: boolean;              // inside position: fixed/sticky ancestor
  attrs: Record<string, string>;      // id, class, data-*, name, type, href, src, aria-* (values trimmed to 100)
  styles?: Record<string, string>;    // subset, see spec 02; omitted in compact payloads
  context?: { parent: string | null; prev: string | null; next: string | null };  // names of neighbours
}

export interface ElementTarget { kind: 'element'; elements: ElementRef[] }  // length > 1 means multi-select

export interface TextTarget {
  kind: 'text';
  container: ElementRef;       // nearest common block ancestor of the selection, never body
  quote: string;               // exact selected text, whitespace normalized
  prefix: string;              // up to 32 chars before, same normalization
  suffix: string;              // up to 32 chars after
  start: number;               // char offset in container.textContent (normalized)
  end: number;
  rects: Rect[];               // client rects at creation, document coords, for redraw before re-anchoring
  blocks?: ElementRef[];       // v2: the blocks the range spans, document order, compact; absent when it spans one
}

export type Stroke =
  | { tool: 'brush'; points: [number, number][]; color: string; width: number }
  | { tool: 'arrow'; from: [number, number]; to: [number, number]; color: string; width: number }
  | { tool: 'rect'; rect: Rect; color: string; width: number }
  | { tool: 'ellipse'; rect: Rect; color: string; width: number }
  | { tool: 'label'; at: [number, number]; text: string; color: string; size: number };
// all coordinates in document CSS px; color is an oklch() or hex string as drawn

export interface PageTarget {
  kind: 'page';
  region: Rect;                // bounding box of all strokes plus padding
  strokes: Stroke[];
  screenshot: string | null;   // path relative to .annotations/, e.g. screenshots/01J8...png; null if capture failed
  elements: ElementRef[];      // elements intersecting the region, largest coverage first, max 12, compact (no styles)
}

export type Target = ElementTarget | TextTarget | PageTarget;

export type MessageKind = 'comment' | 'question' | 'answer' | 'summary' | 'decline' | 'reopen';
export interface Message {
  id: string;
  role: 'user' | 'agent';
  kind: MessageKind;
  text: string;
  at: string;
}

export interface Attachment {
  id: string;                  // ulid, names the file on disk
  name: string;                // original filename, basename only, trimmed to 120 chars
  type: string;                // MIME, sniffed from the content, never the client's Content-Type
  bytes: number;
  path: string;                // relative to the dir: attachments/<annotationId>/<attachmentId>.<ext>
  at: string;
  by: Actor;
}

export interface Annotation {
  id: string;
  protocolVersion: 1 | 2;
  route: string;               // pathname (+ search if the host opts in), used as file key
  url: string;                 // full URL at creation
  mode: Mode;
  target: Target;
  comment: string;             // the user's original note
  status: Status;
  thread: Message[];           // chronological; the first entry duplicates comment as kind 'comment'
  batch: string | null;        // id of the send batch, null while draft
  number: number;              // display number, per route, assigned at creation, never reused
  viewport: Viewport;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  resolvedAt: string | null;   // when status became review
  approvedAt: string | null;
  resolution: { kind: 'changed' | 'declined'; summary: string } | null;
  attachments?: Attachment[];  // files dropped on the annotation, spec 11 §1
  anchorState?: 'exact' | 'moved' | 'lost';   // browser-only, not persisted
}

export interface Batch {
  id: string;
  route: string;
  annotationIds: string[];
  summary: string | null;      // the optional overall message from the Send dialog
  sentAt: string;
}
```

Provide `isAnnotation(x): x is Annotation` and `validateAnnotation(x): string[]` (list of problems, each prefixed with its path) hand-written, no zod in core. Same for `isBatch` / `validateBatch`. Also `summarizeTarget(target): string` returning one line like `button "Save" (form > .actions > button)` or `text "…quote…" in p.lede` — `text "…quote…" across p.lede, blockquote, p` when the run spans blocks — or `drawing over 3 elements: h2 "Pricing", …`.

## State machine

```ts
export const TRANSITIONS: Record<Status, Partial<Record<Actor, Status[]>>> = {
  draft:        { user: ['sent'] },                                 // send (or delete)
  sent:         { agent: ['acknowledged', 'question', 'review'], user: ['sent'] },   // user may edit comment while sent (kind 'comment' appended)
  acknowledged: { agent: ['question', 'review'] },
  question:     { user: ['acknowledged'] },                         // answer
  review:       { user: ['approved', 'sent'] },                     // approve or reopen (kind 'reopen', new batch)
  approved:     { user: ['sent'] },                                 // reopen from history
};
export type Actor = 'user' | 'agent';
export function canTransition(from: Status, to: Status, by: Actor): boolean;
export function applyTransition(a: Annotation, to: Status, by: Actor, msg?: Omit<Message,'id'|'at'>, now?: string): Annotation; // pure, returns new object, throws on illegal move
```

Every transition appends a `Message` when one is given. The resolution comes from that message: kind `summary` sets `{ kind: 'changed' }`, kind `decline` sets `{ kind: 'declined' }`, both with the message text as the summary (`resolutionFromMessage` is exported). Moving to `review` sets `resolvedAt`; `approve` sets `approvedAt`; `sent` sets `sentAt` unless the annotation was already `sent`; `reopen` clears `resolution`, `resolvedAt`, `approvedAt` and sets `batch` to null — the writer that creates the new batch attaches it with `assignBatch(a, batchId)`.

Also exported: `allowedTransitions(from, by)`, `IllegalTransitionError` (carries `allowed`), `makeMessage`.

Deletion is allowed for `draft` only. Anything sent is history; the user can approve it to hide it.

## Files on disk

Root: `<project>/.annotations/` (configurable via plugin option `dir`). Gitignored by `annot init`.

```
.annotations/
  server.json                 { port, pid, startedAt, protocolVersion, basePath }  written by the plugin, deleted on close
  routes/<slug>.json          { route, updatedAt, nextNumber, annotations: Annotation[] }
  batches/<batchId>.json      Batch
  events.jsonl                append-only, one Event per line
  screenshots/<id>.png
  attachments/<annotationId>/<attachmentId>.<ext>
```

`slug(route)`: `/` and `''` → `index`; otherwise lowercase, `/` → `__`, remaining non `[a-z0-9_-]` → `-`, collapse runs of `-` to one and runs of `_` to `__`, strip leading and trailing `-`, `index` if nothing is left. Never longer than 120 chars: a longer slug is cut to 111 and given `-` plus an 8-char FNV-1a hash of the full route.

Path helpers (`routeFile`, `batchFile`, `screenshotFile`, `attachmentDir`, `attachmentFile`) return paths relative to the annotations dir. `RouteFile` and `ServerInfo` are exported types.

Writes are atomic: write a sibling tmp file (`<file>.<pid>.<n>.tmp`) then rename. Readers tolerate a missing or unparseable file as empty.

Node helpers, exported from `@llm-ui-annotation/core/node`: `readRoute`, `readRouteBySlug`, `writeRoute`, `listRouteSlugs`, `listRoutes`, `readAllAnnotations`, `readBatch`, `writeBatch`, `appendEvent`, `readEvents`, `lastEventSeq`, `readServerInfo`, `writeServerInfo`, `removeServerInfo`, `writeScreenshot`, `removeScreenshot`, `screenshotPath`, `writeAttachment`, `readAttachment`, `removeAttachment`, `removeAttachments`, `attachmentPath`, `attachmentDirPath`, `eventsPath`, `routePath`, `initDir`, `findAnnotationsDir`, plus `writeFileAtomic`, `readJsonOrNull`, `readTextOrNull`, `writeJson`, `appendLine`, `ensureDir`, `isEnoent`.

## Events

```ts
export type EventType =
  | 'annotation.created' | 'annotation.updated' | 'annotation.deleted'
  | 'batch.sent'                      // the wake-up event for the agent
  | 'thread.message'
  | 'status.changed';
export interface Event {
  seq: number;                  // monotonic per events.jsonl, assigned by the writer
  at: string;
  type: EventType;
  by: Actor;
  route: string;
  annotationId?: string;
  batchId?: string;
  status?: Status;
  from?: Status;
  message?: Message;
  data?: Annotation | Batch;    // full object on created / batch.sent so a consumer can rebuild without reading routes/
}
```

`seq` starts at 1 and is derived from the last line when the writer starts. Consumers keep a cursor (`--since <seq>`). Core exports `serializeEvent`, `parseEvents`, `parseEventLine`, `isEvent`, `lastSeq`, `eventsSince` and `eventKey` (the `seq + type + id` dedupe key); `appendEvent` in the node entry assigns `seq` from the tail of the file and serializes concurrent appends within a process.

## Wire API (served by the plugin, used by the overlay and by the CLI when the server is up)

Base path `/__annot`. JSON in and out. CORS off (same origin). Errors `{ error: string, problems?: string[] }`. Request and response shapes are exported as types from core (`HealthResponse`, `RoutesResponse`, `CreateBatchRequest`, `TransitionRequest`, `EventsResponse`, `ScreenshotResponse`, …).

```
GET    /__annot/health                          → { ok: true, protocolVersion, dir }
GET    /__annot/routes                          → { routes: string[] }
GET    /__annot/routes/:slug                    → RouteFile
POST   /__annot/annotations                     body Annotation (status draft|sent) → Annotation   (assigns number if 0)
PATCH  /__annot/annotations/:id                 body { comment?: string, target?: Target }  → Annotation  (user edits, appends comment message; a target appends `drawing edited` and returns review to sent)
DELETE /__annot/annotations/:id                 draft only → { ok }
POST   /__annot/batches                         body { route, annotationIds, summary } → Batch      (moves drafts to sent, emits batch.sent)
POST   /__annot/annotations/:id/transition      body { to: Status, by: Actor, message?: {kind,text,role} , resolution? } → Annotation
GET    /__annot/events?since=<seq>              → { events: Event[] }
GET    /__annot/events/stream?since=<seq>       SSE, one Event per message, heartbeat every 15 s       (used by annot watch)
POST   /__annot/screenshots/:id                 body image/png → { path }
GET    /__annot/screenshots/:id                 → the PNG, served inert (nosniff, sandboxed CSP)
POST   /__annot/annotations/:id/attachments     body the file bytes, ?name=<encoded>&by=user|agent → Attachment
DELETE /__annot/annotations/:id/attachments/:attachmentId       → { ok: true }
GET    /__annot/attachments/:id/:attachmentId                   → the file
```

Attachments: accepted types `image/png|jpeg|gif|webp|svg+xml`, `application/pdf`, `text/markdown|plain|csv`,
`application/json`; 20 MB per file, 50 MB and 10 files per annotation. The type is sniffed from magic bytes
and only then from the extension of `?name`, so the client's `Content-Type` never decides what is stored.
Attaching and detaching emit `annotation.updated`; deleting a draft deletes its attachment directory.

Websocket to the overlay reuses Vite's HMR socket with custom events `annot:annotation`, `annot:deleted`, `annot:route` (full route file after external change). See spec 05.

## Markdown rendering for the agent

`renderBatchMarkdown(batch, annotations, opts: { level: 'compact'|'standard'|'detailed', dir })` lives in core and is used by the CLI. Standard output for one batch:

```
## Feedback batch 01J8…  ·  route /pricing  ·  3 items
Summary from the user: all of these are about the pricing table spacing.

### #4 · element · button "Choose Pro"
selector: main > section.pricing > article:nth-of-type(2) button
text: Choose Pro   rect: 612,940 220×44   role: button
context: parent article "Pro", prev p "$29 / month", next null
styles: font-size 14px · padding 10px 18px · background-color oklch(0.55 0.15 250)
> Make this the same height as the Free button.
id: 01J8…

### #5 · text · in p.lede
quote: "Cancel anytime, no questions asked"   prefix: "…per seat. "   suffix: " Upgrade or"
container: p.lede   offsets: 17-51
> Typo: should be "no questions asked." with a period, and drop the comma before it.
id: 01J8…

### #6 · page · drawing over h2 "Pricing", section.pricing, article "Free"
screenshot: /repo/.annotations/screenshots/01J8….png  (1180×640)
elements: h2 "Pricing" (main > h2), section.pricing (…), article "Free" (…)
> The three cards should be visually one group, the gaps are uneven.
id: 01J8…

Reply with: annot ack <id…> · annot ask <id> "…" · annot done <id> --summary "…" · annot decline <id> --reason "…"
```

An annotation with attachments carries one block before its comment, at every level, absolute so the agent
can open the files with its own tools:

```
attachments:
  /repo/.annotations/attachments/01J8…/01J9….png   mock-v2.png (image/png, 240 KB)
```

`compact` drops styles/context/prefix/suffix; `detailed` adds the `fallbacks`, the full `attrs`, the status and every thread message. Every item ends with its full id so `annot done <id>` is copy-pasteable, and `dir` is joined onto the relative screenshot path so page items carry an absolute path. Core also exports `renderAnnotationMarkdown`, `renderAnswerMarkdown` and `renderReopenMarkdown` for the answer and reopen sections in spec 06, plus `AGENT_VERBS_FOOTER`.

## Acceptance criteria

- `pnpm --filter @llm-ui-annotation/core test` covers: id sortability, slug edge cases, every legal and illegal transition, `applyTransition` immutability, `validateAnnotation` on hand-written bad fixtures, markdown rendering snapshot for the three levels using a fixture batch containing one of each mode, and the node helpers against a temp dir (atomic write, missing file as empty, `seq` continuation).
- `packages/core/src/model/index.ts` exports every type above and nothing DOM-dependent; a test asserts no file outside `src/node/` imports a node builtin, so a browser bundle importing `@llm-ui-annotation/core` never pulls in `node:fs`.
- `docs/specs/01-data-model-and-protocol.md` updated with any field renamed during implementation.

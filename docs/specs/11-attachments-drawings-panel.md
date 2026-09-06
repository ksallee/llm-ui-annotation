# 11 · Attachments, drawings as objects, and the panel pass

Three threads from a hands-on session. §1 is a protocol change, §2 and §3 are overlay work. Supersedes parts of specs 04 and 09; edit those in the same commits.

## 1. Attachments

"Make it look like this" is one of the most common things a person wants to say, and today there is no way to say it. The plugin already stores and serves screenshots and the CLI already hands the agent an absolute path, so the machinery mostly exists.

### Protocol

```ts
export interface Attachment {
  id: string;                 // ulid, names the file on disk
  name: string;               // original filename, trimmed to 120 chars
  type: string;               // MIME, sniffed from content, not trusted from the client
  bytes: number;
  path: string;               // relative to the dir, e.g. attachments/01J8…/mock-v2.png
  at: string;
  by: Actor;
}

export interface Annotation {
  // …unchanged…
  attachments?: Attachment[];
}
```

`protocolVersion` stays **2**: the field is additive and optional, and v2 readers already tolerate unknown-but-absent fields. Say so in spec 01 rather than bumping again.

Accepted: `image/png|jpeg|gif|webp|svg+xml`, `application/pdf`, `text/markdown|plain|csv`, `application/json`. Reject everything else with the list. 20 MB per file, 50 MB per annotation, 10 files per annotation. Sniff the type from magic bytes and fall back to the extension; never trust the client's `Content-Type`, which is exactly how the earlier screenshot traversal became exploitable.

### Storage and wire

`<dir>/attachments/<annotationId>/<attachmentId>.<ext>`. Deleting a draft deletes its attachment directory.

```
POST   /__annot/annotations/:id/attachments    body: the file, ?name=<encoded>[&by=user|agent] → Attachment
DELETE /__annot/annotations/:id/attachments/:attachmentId                        → { ok: true }
GET    /__annot/attachments/:id/:attachmentId                                    → the file
```

`:id` and `:attachmentId` go through `isId` before touching the filesystem, and the file is located from the
stored record rather than from the URL. Emit `annotation.updated` on attach and on detach.

Failures: 400 on a bad id or an empty body · 403 on a foreign `Origin`/`Sec-Fetch-Site` · 404 on an unknown
annotation or attachment · 409 on the eleventh file · 413 over 20 MB per file or 50 MB per annotation ·
**415** on an unsupported type, with the accepted list in `problems`, and on the CORS-simple content types
(`text/plain`, `multipart/form-data`, `application/x-www-form-urlencoded`) that let the old screenshot
endpoint be written to cross-origin. 415 rather than the 400 first written here: the status exists for
exactly this, and the body still names the list. Callers send the real MIME or `application/octet-stream`.
Attachments are served back with `nosniff` and a sandbox CSP so an uploaded SVG cannot run on the dev origin.

### What the agent sees

`renderBatchMarkdown` gains a line per annotation that has them, at every level:

```
attachments:
  /abs/path/.annotations/attachments/01J8…/01J9….png   mock-v2.png (image/png, 240 KB)
  /abs/path/.annotations/attachments/01J8…/01JA….pdf   brand-spec.pdf (application/pdf, 1.1 MB)
```

Absolute, because the agent reads them with its own file tools. `annot show` lists them; add `annot attach <id> <file…>` so an agent can hand something back.

## 2. A drawing is an object

Strokes are painted after they are committed, but nothing can pick them up again. That is the gap — not visibility.

- **Select**: clicking a drawing's region selects it, in Draw mode or with no mode active. Its box and eight handles appear; `Esc` deselects. Only one drawing is selected at a time.
- **Edit**: move, resize, restyle and delete, exactly as spec 10 §2 describes for pending strokes. Dragging the box moves the marks with it, as it already does for the pending drawing. `transformStrokes(strokes, from, to)` in `packages/core/src/dom/strokes.ts`, built on the existing `translateStrokes`.
- **Editing something already sent** appends a `comment` message reading `drawing edited` and PATCHes the target. The status does not change: the agent finds out through the thread, which is the same way it learns about an edited comment. A `review` annotation whose drawing is edited goes back to `sent` — the agent's answer was about the old marks.
- Adding strokes to a selected drawing extends it rather than starting a new one. Starting a stroke on empty canvas with nothing selected begins a new drawing, as now.
- Approved annotations are not selectable; reopen first.

## 3. The panel

Keep the list; tighten it. Every problem below is visible in the panel as it stands today.

- **A row names its status.** `review`, `question`, `acknowledged` as a word, next to the number. The 3px colour bar stays but stops being the only signal.
- **The primary action is a real button**, not a ghost at the right edge, chosen by status: `review` → Approve (with Reopen beside it), `question` → Answer, `draft` → Send, `approved` → Reopen. **`acknowledged` and `sent` get Reopen-style secondary actions rather than nothing** — today those rows have no action at all and read as dead.
- **Drawings show a thumbnail.** A page annotation has a screenshot; render it at 44×44 in the row. This is the fastest possible answer to "which of these is a drawing", and it beats a monochrome glyph. Fall back to the mode icon when the capture failed.
- **Stop truncating the identifying half.** `button "Choose Pro"` matters more than the selector prefix; truncate the selector, keep the name.
- **One chip row, not two.** Counts live on the filter chips: `Needs you 2 · Open 1 · Done 3 · All 6`. Drop the separate count row.
- **The bulk bar follows the selection.** Pin it under the last selected row, or float it at the top of the list, rather than at the bottom of a 360px drawer several hundred pixels away. It must be reachable without scrolling.
- **Attachments** appear as a row of chips under the comment; images as 32px thumbnails. Dropping a file on a row attaches it.
- **Marker placement for page annotations** puts the marker at the region's top-left, which lands on unrelated content. Place it at the top-left *inset* into the region, over the drawing's own box.

## Acceptance criteria

- A PNG dropped on the popup and a PDF dropped on a panel row both land in `attachments/<annotationId>/`, appear in the row, and show up in `annot pending` as absolute paths with name, type and size.
- A rejected type returns 415 naming the accepted list; a 21 MB file is refused; a traversing `:attachmentId` is refused; a write with a CORS-simple content type or a foreign `Origin` is refused.
- Deleting a draft removes its attachment directory.
- Clicking a committed drawing selects it; dragging moves marks and box together; the stored `PageTarget` reflects the new geometry.
- Editing a `review` drawing returns it to `sent` and appends a thread message.
- Every panel row shows a status word and at least one action; a page annotation shows its screenshot thumbnail.
- With three rows selected, the bulk bar is visible without scrolling.
- axe reports no serious violations with attachments and thumbnails present.

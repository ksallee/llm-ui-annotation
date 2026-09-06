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
POST   /__annot/annotations/:id/attachments    body: the file, ?name=<encoded>  → Attachment
DELETE /__annot/annotations/:id/attachments/:attachmentId                        → { ok }
GET    /__annot/attachments/:id/:attachmentId                                    → the file
```

`:id` and `:attachmentId` go through `isId` before touching the filesystem. Emit `annotation.updated`.

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

**Selection belongs to a tool, not to a click.** Drawings cover large areas, so making them
click-to-select everywhere would mean a drawing sitting over a paragraph swallows the click when you
are trying to select text under it, or pick the element beneath it. Outside Draw, a drawing is inert.

- **Outside Draw mode**: strokes are painted and the marker is placed, and that is all. No box, no
  handles, no click target beyond the existing hover card. Element and Highlight behave as if the
  drawing were not there.
- **In Draw mode**: every drawing on the route shows a faint dashed box, so what is pickable is
  visible without hunting for it. This is also the answer to "which drawings exist on this page".
- **The Select tool** (`V`, first in the drawing bar, per spec 10 §2) is what picks one. Click a
  drawing's box or its marks to select; its handles appear; `Esc` deselects. Only one at a time. With
  any other tool active, clicking inside a drawing draws, as it does now.
- **Edit**: move, resize, restyle and delete, exactly as spec 10 §2 describes for pending strokes.
  Dragging the box moves the marks with it, as it already does for the pending drawing.
  `transformStrokes(strokes, from, to)` in `packages/core/src/dom/strokes.ts`, built on the existing
  `translateStrokes`.
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
- A rejected type returns 400 naming the accepted list; a 21 MB file is refused; a traversing `:attachmentId` is refused.
- Deleting a draft removes its attachment directory.
- In Draw mode with the Select tool, clicking a committed drawing selects it; dragging moves marks and box together; the stored `PageTarget` reflects the new geometry.
- In Element and Highlight mode, a click that lands inside a committed drawing reaches the host element or the text underneath it, not the drawing.
- Entering Draw mode reveals a faint box around every drawing on the route; leaving it hides them again.
- Editing a `review` drawing returns it to `sent` and appends a thread message.
- Every panel row shows a status word and at least one action; a page annotation shows its screenshot thumbnail.
- With three rows selected, the bulk bar is visible without scrolling.
- axe reports no serious violations with attachments and thumbnails present.

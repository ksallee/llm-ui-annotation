# 11 · Attachments and the panel pass

Two threads from a hands-on session. §1 is a protocol change, §2 is overlay work. Supersedes parts of specs 04 and 09; edit those in the same commits.

## 1. Attachments

"Make it look like this" is one of the most common things a person wants to say, and today there is no way to say it. The plugin stores files and the CLI hands the agent absolute paths.

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

Accepted: `image/png|jpeg|gif|webp|svg+xml`, `application/pdf`, `text/markdown|plain|csv`, `application/json`. Reject everything else with the list. 20 MB per file, 50 MB per annotation, 10 files per annotation. Sniff the type from magic bytes and fall back to the extension; never trust the client's `Content-Type`.

### Storage and wire

`<dir>/attachments/<annotationId>/<attachmentId>.<ext>`. Deleting a draft deletes its attachment directory.

```
POST   /__annot/annotations/:id/attachments    body: the file, ?name=<encoded>[&by=user|agent] → Attachment
DELETE /__annot/annotations/:id/attachments/:attachmentId                        → { ok: true }
GET    /__annot/attachments/:id/:attachmentId                                    → the file
```

`:id` and `:attachmentId` go through `isId` before touching the filesystem, and the file is located from the
stored record rather than from the URL. Emit `annotation.updated` on attach and on detach. The list is
server-owned: `POST /annotations` neither writes nor clears it, so re-posting an edited draft cannot drop the
files and a client cannot invent an entry.

Failures: 400 on a bad id or an empty body · 403 on a foreign `Origin`/`Sec-Fetch-Site` · 404 on an unknown
annotation or attachment · 409 on the eleventh file · 413 over 20 MB per file or 50 MB per annotation ·
**415** on an unsupported type, with the accepted list in `problems`, and on the CORS-simple content types
(`text/plain`, `multipart/form-data`, `application/x-www-form-urlencoded`), which a page on another origin
can send without a preflight. 415 because the status exists for exactly this; the body still names the list. Callers send the real MIME or `application/octet-stream`.
Attachments are served back with `nosniff` and a sandbox CSP so an uploaded SVG cannot run on the dev origin.

#### In the overlay

Three ways to say "make it look like this", all of them a file landing on one annotation:

- **Drop on the popup** while writing, and **paste** an image from the clipboard into it. The note
  has no id yet, so the first file creates its draft server-side — status `draft`, empty comment,
  empty thread — and the commit PATCHes the comment onto it. Cancelling deletes that draft, and
  with it the attachment directory.
- **Drop on a panel row**, which is the common case: the reference turns up after the note is
  written.
- **Drop on the page** while a mode is active attaches to the note being written; with no popup
  open the toast says where to drop instead of doing nothing quietly.

Only file drags are taken: a text drag in the host page is never preventDefaulted, and a target
outlines itself only while files are over it. Attachments show as chips under the comment, images as
32 px thumbnails from `GET /attachments/:id/:attachmentId`, each opening in a new tab and each
removable. A refusal is a toast naming the reason: the accepted list for 415, the caps for 413.
Uploads go out as `application/octet-stream` — the server refuses the CORS-simple types, so a `.txt`
sent under its own MIME would come back 415.

## What the agent sees

`renderBatchMarkdown` gains a line per annotation that has them, at every level:

```
attachments:
  /abs/path/.annotations/attachments/01J8…/01J9….png   mock-v2.png (image/png, 240 KB)
  /abs/path/.annotations/attachments/01J8…/01JA….pdf   brand-spec.pdf (application/pdf, 1.1 MB)
```

Absolute, because the agent reads them with its own file tools. `annot show` lists them; add `annot attach <id> <file…>` so an agent can hand something back.

## 2. The panel

Keep the list; tighten it. Every problem below is visible in the panel as it stands today.

- **A row names its status.** `review`, `question`, `acknowledged` as a word, next to the number. The 3px colour bar stays but stops being the only signal.
- **The primary action is a real button**, not a ghost at the right edge, chosen by status: `review` → Approve (with Reopen beside it), `question` → Answer, `draft` → Send, `approved` → Reopen. **`acknowledged` and `sent` get Reopen-style secondary actions rather than nothing** — today those rows have no action at all and read as dead; they get **Comment**, which is the one thing there is to say to an agent that is already working. The actions sit on their own line under the comment, accent-filled for the primary, which is where a 360 px drawer has room for them.
- **Stop truncating the identifying half.** `button "Choose Pro"` matters more than the selector prefix; truncate the selector, keep the name. The two are separate spans: the name in prose type at full length, the selector in mono after it, capped at 40% of the line and clipped from its head, which is the half that repeats.
- **One chip row, not two.** Counts live on the filter chips: `Needs you 2 · Open 1 · Done 3 · All 6`. Drop the separate count row.
- **The bulk bar follows the selection.** It floats at the top of the list, sticky inside the scroller, rather than at the bottom of a 360px drawer several hundred pixels away. It is reachable without scrolling, and the footer keeps only Approve all and Send drafts.
- **Attachments** appear as a row of chips under the comment; images as 32px thumbnails. Dropping a file on a row attaches it.

## Acceptance criteria

- A PNG dropped on the popup and a PDF dropped on a panel row both land in `attachments/<annotationId>/`, appear in the row, and show up in `annot pending` as absolute paths with name, type and size.
- A rejected type returns 415 naming the accepted list; a 21 MB file is refused; a traversing `:attachmentId` is refused; a write with a CORS-simple content type or a foreign `Origin` is refused.
- Deleting a draft removes its attachment directory.
- Every panel row shows a status word and at least one action.
- With three rows selected, the bulk bar is visible without scrolling.
- axe reports no serious violations with attachments present.

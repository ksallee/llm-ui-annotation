# The Shape of a Reading Room

*A room for one document at a time. Everything else is a rail on the left and a
note you have not written yet.*

## Why one document

A reader that holds a single file can afford to be quiet. There is no list to
scroll, no tab to lose, no state to reconcile beyond the text itself. The file on
disk is the source of truth; the page is a view of it, and when the file changes
the view catches up without asking.

That is the whole contract. Edit the markdown in your editor, and the paragraph
you are looking at reflows under your cursor a moment later.

## How annotating works

Select a run of text and a chip appears at the end of the selection. Write what
should change and it goes out immediately — there is no draft pile to manage in
this app, because a note about a sentence is rarely worth batching.

- **Text** is the default mode: the selection is anchored by quote and offsets.
- **Element** outlines whatever you point at, for layout and styling notes.
- **Page** lets you draw over the document and sends a screenshot along.

The anchor survives edits. If a paragraph moves, the note follows it and the
highlight is drawn with a dashed edge until the offsets line up again.

## What the agent sees

Each note arrives with the quote, the surrounding thirty characters on each side,
and a selector for the block it came from. That is usually enough to find the
sentence in the source file without guessing.

> The agent replies with a summary, not a diff. You read the summary in the
> panel, look at the paragraph, and approve — at which point the highlight
> disappears and the note is done.

If the request is ambiguous the agent asks instead, and the question waits in the
panel until you answer it in place.

---

*Written for the reader app. Replace it by pointing `DOC` at a file of your own.*

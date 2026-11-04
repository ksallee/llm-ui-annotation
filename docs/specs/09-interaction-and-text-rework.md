# 09 · Interaction rework and multi-block text

Owner: `packages/svelte`, plus `packages/core/src/model/types.ts` and `src/dom/text.ts` for §5. Written after the first hands-on session with the overlay; every item here comes from testing it, not from theory. Supersedes the conflicting parts of specs 03 and 04, which are edited in the same commit.

## 1. Naming

| Was | Is |
|-----|----|
| Element mode | **Element** |
| Text mode | **Highlight** |
| markers | **pins** |

`Text` reads as "put text somewhere". `Highlight` says what the mode does and what you see.

"Marker" is jargon: nobody reading the toolbar knows that the marker is the numbered circle pinned to an annotated element. Call it a pin. The visibility control reads **Pins: all → dots → none**.

## 2. Shortcuts, and not fighting the host page

The overlay sits on top of an app we do not control, which may bind anything. One binding is global; everything else is scoped.

- **Global**: `⌥A` opens the command palette. Configurable in Settings, persisted in `annot:prefs`. Nothing else in the overlay binds a key while idle.
- **Scoped to an engaged overlay**: `E` `H` switch modes, `I` panel, `⇧P` pause, `⌫` delete focused draft, `Esc` exits. Engaged means a mode is active *or the pill is expanded*. An active mode already runs the capture layer over the page, and expanding the pill is an explicit act; without the second half, `Esc` out of a mode leaves the pill open with every letter dead, so there is no way back into a mode from the keyboard.
- **Scoped to a surface**: while the palette, panel, popup or settings has focus, keys belong to that surface.
- **Never**: while focus is in any input, textarea or contenteditable — the host page's *or one of
  ours*. Events from the shadow root retarget to the host element, so the event target alone cannot
  answer this; ask the shadow root what has focus. Without that, typing a note fires `E`, `H` and
  `I`. `Escape` still passes through while typing, since it is how you
  leave the field.

Holding `⌘`/`Ctrl` still passes events through to the host; the cursor changes to indicate it (currently a gap).

## 3. Command palette

Opens on `⌥A`, rebindable in Settings. There is no button for it in the pill — the shortcut is the way in. A single input, fuzzy-matched, arrow keys and Enter, Esc closes and restores focus.

Entries, in rank order: modes · panel filters · settings toggles · **annotations on this route**, matched by `#4` or by words from the comment, selecting one scrolls to it and opens its card.

Every entry shows its scoped shortcut on the right, which is how the shortcuts stay discoverable now that they are not global.

Not in the palette: Approve, Reopen, Send, Approve all. They mutate the loop and a fuzzy match plus Enter is too easy to fire by accident. They stay in the panel where the target is visible.

## 4. Toolbar layout

The single pill had grown to about twenty-six controls, which is why it stopped reading as one thing.
It holds these and nothing else: Grip · Element · Highlight · Pins · Pause · Send (count) · Panel
(badge) · Settings · Close. Draggable, snaps to a corner, position remembered.

Tooltips render above their button, so a pill sitting within 48 px of the viewport top flips them
below — otherwise its tooltips are clipped by the top of the window.

## 5. Multi-block highlight

Today a selection crossing a paragraph boundary is refused with a chip telling the reader to stay
inside one paragraph. **That message and the restriction behind it are removed**, string included. Prose runs across blocks and
a reader selects a thought, not a `<p>`; the agent only needs the text and roughly where it is. There
is no case where a user should be told to redo a selection they made correctly.

Change `describeRange` so that when a range spans several blocks it returns a `TextTarget` whose `container` is the **nearest common block ancestor** (still never `body` or `html`), with `quote`, `prefix`, `suffix`, `start` and `end` computed against that container's normalized text exactly as now. The existing re-anchor ladder then works unchanged — it never assumed the container held only one block.

Add one optional field, and bump the protocol:

```ts
export interface TextTarget {
  // …unchanged…
  blocks?: ElementRef[];   // the block elements the range actually spans, in document order,
                           // present only when there is more than one; compact, no styles
}
```

`protocolVersion` goes to **2**. Spec 01 is edited in the same commit, per the freeze rule. Readers treat a missing `blocks` as a single-block target, so v1 files still load.

`summarizeTarget` and `renderBatchMarkdown` name the spanned blocks: `text "…quote…" across p.lede, p, blockquote`. Refuse only when the common ancestor would be `body` — a selection spanning the whole page is a mistake, and the message says so.

## 6. Connection dot

The dot beside Settings has a tooltip and nothing else, so it reads as decoration. Show it only when the state is not `connected`, and give it a visible label in the panel header instead: `dev server not reachable` / `polling`. When connected, no dot.

## 7. Panel rows: acting on a note without expanding it

A collapsed row shows the note but hides every action, so doing anything means expanding first. The
common actions belong on the row.

- Each row carries its actions inline, chosen by status: `review` → **Approve** with **Reopen**
  beside it, `question` → **Answer**, `draft` → **Send**, `approved` → **Reopen**, `sent` and
  `acknowledged` → **Comment**. No status offers nothing — a row with no action reads as dead. The
  primary one is filled with the accent and sits on its own line under the comment, where there is
  room for a real button rather than a ghost at the right edge. A `⋯` menu holds the rest (Edit,
  Delete, Locate).
- The row also names its status as a word (spec 11 §2); the colour bar alone never said which
  button was missing and why.
- Expanding still reveals the full thread and the secondary actions; it is no longer the only way to
  act.
- Hovering a row highlights its target on the page, so the row can be acted on without expanding it
  and losing the connection to what it points at.

## 8. Multi-select and bulk actions

Approving twelve notes one at a time is the normal case after an agent run, and "Approve all in
review" is too blunt for it.

- A checkbox per row, appearing on hover and staying once anything is selected. `⇧`-click extends a
  range, `⌘`/`Ctrl`-click toggles one, `⌘A` selects everything the current filter shows.
- With a selection, a bulk bar appears at the top of the list — sticky, inside the scroller, next
  to the rows being ticked rather than several hundred pixels below them at the foot of the drawer:
  **Approve** · **Reopen** · **Send** · **Delete**. Each acts on the selected notes that allow the transition and names them: `Approve (3)`
  when every selected note qualifies, `Approve (1 of 3)` when only some do, and disabled at `(0 of 3)`
  when none do. Acting on the subset beats going dead — a bar reading "Approve (0)" with everything
  greyed reads as a broken panel, not as a rule, which is exactly how it was first reported.
- One undo toast for the whole batch, 6 s, same as Approve all today.
- Selection is per route, clears on filter change, and is announced in the live region
  (`3 annotations selected`).

## 9. Keycaps

Shortcut keycaps in tooltips render at 10 px mono at 0.6 opacity — too small and too faint to read,
which defeats the point of moving discoverability into tooltips and the palette. They are
`--annot-text-sm` (12 px) at 0.9 opacity on a tinted ground, padded so they read as keys. Applies
everywhere a key is shown: tooltips, the shortcuts sheet, the popup's primary button, and the
palette's right-hand column.

## 10. Icons

`gear` was a circle with eight straight radiating spokes, which reads as a sun; fixed already. Audit the rest at 20 px against their labels — `locate` has the same circle-plus-spokes shape.

## Acceptance criteria

- No overlay key except `⌥A` fires while idle. Test: bind `keydown` on the host document in the demo, press `e` `h` `i` `p`, assert the host saw them and no mode changed. With a mode active, assert the reverse.
- The palette opens on `⌥A`, filters by comment text, and jumping to `#N` scrolls it into view.
- Rebinding the palette key in Settings survives a reload.
- A selection spanning two paragraphs produces one annotation whose `blocks` has two entries and whose highlight covers both; it re-anchors `exact` after a reload and `moved` after a paragraph is inserted above.
- A selection spanning a paragraph, a blockquote and a third paragraph works the same way.
- The old one-paragraph refusal string appears nowhere in the tree, code, tests or docs.
- A selection spanning the whole `body` is refused with a message.
- Every row in the panel shows its primary action while collapsed, and it performs the transition without expanding the row.
- Selecting three `review` rows and pressing Approve moves all three and offers one undo toast; a mixed selection disables the actions that would be illegal. The bar is on screen without scrolling.
- Keycaps render at 12 px and are legible in both schemes.
- Every icon is recognisable at 20 px next to its label; no glyph is reused for two meanings.

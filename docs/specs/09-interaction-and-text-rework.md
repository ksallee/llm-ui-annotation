# 09 · Interaction rework and multi-block text

Owner: `packages/svelte`, plus `packages/core/src/model/types.ts` and `src/dom/text.ts` for §5. Written after the first hands-on session with the overlay; every item here comes from testing it, not from theory. Supersedes the conflicting parts of specs 03 and 04, which are edited in the same commit.

## 1. Naming

| Was | Is |
|-----|----|
| Element mode | **Element** |
| Text mode | **Highlight** |
| Page mode | **Draw** |
| page tool `label` | **Caption** |
| markers | **pins** |

`Text` and the `label` tool both read as "put text somewhere". `Highlight` says what the mode does and what you see. `Draw` says what page mode is for. The stroke's `tool` value stays `'label'` on the wire — the protocol is frozen and the word is only user-facing.

"Marker" is jargon: nobody reading the toolbar knows that the marker is the numbered circle pinned to an annotated element. Call it a pin. The visibility control reads **Pins: all → dots → none**.

## 2. Shortcuts, and not fighting the host page

The overlay sits on top of an app we do not control, which may bind anything. One binding is global; everything else is scoped.

- **Global**: `⌥A` opens the command palette. Configurable in Settings, persisted in `annot:prefs`. Nothing else in the overlay binds a key while idle.
- **Scoped to an active mode**: `E` `H` `D` switch modes, `I` panel, `⇧P` pause, `⌫` delete focused draft, `⌘Z`/`⇧⌘Z` undo in Draw, `Esc` exits. Safe because an active mode already runs the capture layer over the page, so the host is not receiving input anyway.
- **Scoped to a surface**: while the palette, panel, popup or settings has focus, keys belong to that surface.
- **Never**: while focus is in a host input, textarea or contenteditable. Unchanged.

Holding `⌘`/`Ctrl` still passes events through to the host; the cursor changes to indicate it (currently a gap).

## 3. Command palette

Opens on `⌥A` or from the pill. A single input, fuzzy-matched, arrow keys and Enter, Esc closes and restores focus.

Entries, in rank order: modes · draw tools and colors when in Draw · panel filters · settings toggles · **annotations on this route**, matched by `#4` or by words from the comment, selecting one scrolls to it and opens its card.

Every entry shows its scoped shortcut on the right, which is how the shortcuts stay discoverable now that they are not global.

Not in the palette: Approve, Reopen, Send, Approve all. They mutate the loop and a fuzzy match plus Enter is too easy to fire by accident. They stay in the panel where the target is visible.

## 4. Toolbar layout

The single pill has grown to about twenty-six controls, which is why it stopped reading as one thing. Split it.

- **Bottom right, always**: the pill. Grip · Element · Highlight · Draw · Pins · Pause · Send (count) · Panel (badge) · Settings · Close. Draggable, snaps to a corner, position remembered.
- **Top centre, only in Draw**: the drawing bar. Brush · Arrow · Rect · Ellipse · Caption · Eraser | five colors | three widths | Undo · Redo · Clear. Appears when Draw activates and leaves with it, 200 ms enter / 120 ms exit, `prefers-reduced-motion` respected. Top centre because the drawing happens under the cursor in the middle of the page and a bottom-right bar is where the hand already is.

Tools carry number shortcuts `1`–`6` while Draw is active, shown in their tooltips.

## 5. Multi-block highlight

Today a selection crossing a paragraph boundary is refused. That is backwards: prose runs across blocks and a reader selects a thought, not a `<p>`. The agent only needs the text and roughly where it is.

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

## 6. Draw region is resizable

The dashed bounding box around a drawing is currently derived from `strokeBounds` and fixed. It decides which elements are captured and what the screenshot crops to, so the user must be able to correct it.

Eight handles plus drag-to-move, minimum 40×40, live-updating the intersecting element list underneath. Once moved, the box stops tracking `strokeBounds`; a small **Fit to drawing** action restores that. The region is what `PageTarget.region` records.

## 7. Connection dot

The dot beside Settings has a tooltip and nothing else, so it reads as decoration. Show it only when the state is not `connected`, and give it a visible label in the panel header instead: `dev server not reachable` / `polling`. When connected, no dot.

## 8. Keycaps

Shortcut keycaps in tooltips render at 10 px mono at 0.6 opacity — too small and too faint to read,
which defeats the point of moving discoverability into tooltips and the palette. They are
`--annot-text-sm` (12 px) at 0.9 opacity on a tinted ground, padded so they read as keys. Applies
everywhere a key is shown: tooltips, the shortcuts sheet, the popup's primary button, and the
palette's right-hand column.

## 9. Icons

`gear` was a circle with eight straight radiating spokes, which reads as a sun; fixed already. Audit the rest at 20 px against their labels — `locate` has the same circle-plus-spokes shape, and the Caption tool currently uses a speech bubble, which is a comment, not a text label.

## Acceptance criteria

- No overlay key except `⌥A` fires while idle. Test: bind `keydown` on the host document in the demo, press `e` `h` `d` `i` `p`, assert the host saw them and no mode changed. With a mode active, assert the reverse.
- The palette opens on `⌥A`, filters by comment text, and jumping to `#N` scrolls it into view.
- Rebinding the palette key in Settings survives a reload.
- The drawing bar is present only in Draw mode; the pill never shows drawing tools.
- A selection spanning two paragraphs produces one annotation whose `blocks` has two entries and whose highlight covers both; it re-anchors `exact` after a reload and `moved` after a paragraph is inserted above.
- A selection spanning the whole `body` is refused with a message.
- Dragging a region handle changes `PageTarget.region` and the captured element list; **Fit to drawing** restores it.
- Every icon is recognisable at 20 px next to its label; no glyph is reused for two meanings.

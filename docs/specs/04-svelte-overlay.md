# 04 · Svelte overlay

Owner: `packages/svelte`. Svelte 5, runes. `<annot-overlay>` is a hand-written custom element that mounts `Annotator.svelte` into an open shadow root, rather than a component compiled with `customElement: true`: the overlay needs to own the shadow root, the host element's inline style and the props, and that stays true in any bundler. Also export the plain component `Annotator.svelte` and a `mount(options)` function. Peer deps: `svelte ^5`. Optional peer: `modern-screenshot` (page-mode screenshots).

## Mounting

- Auto: the Vite plugin sets `globalThis.__ANNOT_OPTIONS__` (and optionally `globalThis.__ANNOT_HOT__ = import.meta.hot`), then imports `@llm-ui-annotation/svelte/auto`, which appends `<annot-overlay>` to `body` once `DOMContentLoaded`. A host that imports the module itself calls `autoMount(options)` synchronously and wins. Attributes: `accent`, `scheme`, `density`, `route-key` (optional override of `location.pathname`), `send-mode`, `base-path`, `mode`.
- Manual: `<Annotator accent="#2C8A85" />` anywhere in the host app, dev only (`import.meta.env.DEV`).
- Transport: `fetch` to `/__annot/*` and `import.meta.hot.on('annot:*')` when available; else poll `/__annot/events?since=` every 2 s. The overlay never writes localStorage for annotations, only for UI prefs (`annot:prefs`): pill position, scheme override, send mode, detail level, last mode, panel open.

## Layers inside the shadow root

```
<div class="annot-root" data-scheme>           tokens live here
  <svg class="layer highlights">                element outlines, text highlight rects, page strokes, region boxes
  <div class="layer markers">                   numbered markers, hover cards
  <div class="layer capture">                   full-viewport pointer catcher while a mode is active (transparent)
  <Popup/> <Panel/> <Toolbar/> <Toasts/>
</div>
```

All layers are `position: fixed; inset: 0; pointer-events: none` except `capture` while a mode is active and interactive children. Coordinates are document px translated by scroll on every `scroll`/`resize` (passive listeners, rAF-throttled) and on a `ResizeObserver` of `body` plus a throttled `MutationObserver` (300 ms) to re-anchor.

Never mutate the host DOM. Text highlights use the CSS Custom Highlight API when available (`CSS.highlights.set('annot-<status>', new Highlight(...ranges))`, styled from the shadow root via a `<style>` injected in the host head containing only `::highlight(annot-*)` rules, all colors from the same tokens) and fall back to rects in the `highlights` layer. Hit-testing for text always uses the rects layer (invisible, `pointer-events: auto`).

## Toolbar (the pill)

Collapsed: a single 44 px round button with the logo glyph and a badge with the count of drafts (batch mode) or unread agent activity (questions + reviews). Click expands.

Expanded, left to right:

1. Mode segment: **Element** (`E`), **Highlight** (`H`), **Draw** (`D`). One active or none. Clicking the active one exits (`Esc` too).
2. Drawing tools (only in Draw mode): brush, arrow, rect, ellipse, caption, eraser · color swatches (5, from spec 03) · width (3 steps) · undo (`⌘Z`) · redo (`⇧⌘Z`) · clear drawing. They live in their own bar at the top centre, not in the pill — spec 09 §4.
3. Pause animations (`⇧P`), pin visibility cycle (all → dots → none).
4. **Send** (`⌘↵`) with the draft count, batch mode only. Disabled when no drafts.
5. Inbox / panel toggle (`I`) with badge for questions + reviews.
6. Settings (gear) · Close (`Esc` twice or the ×).

Tooltips show label and shortcut. The pill is draggable by the grip at its left edge; snaps to the nearest corner on release.

**Block page interactions** (settings, default on): while a mode is active, the capture layer swallows clicks so buttons in the host do not fire. Holding `⌘`/`Ctrl` lets events through (cursor changes) so you can open a menu and then annotate inside it. Hover and selection still work with blocking on.

## Modes

### Element mode
Hover shows a 2 px outline and a small label chip (`button "Save"`) above the element; the label is `describeName(el)` from `core/dom`. Click opens the popup anchored to the element. Drag from empty space draws a marquee: the outermost elements at least 50% inside are selected, then the selection steps down one level for as long as a single container is tiled (≥ 70% of its area) by children that are ≥ 90% inside, so a box round a card grid selects the cards and a box round one card selects the card. `⇧` extends the selection and shows an Annotate chip. Ignore the overlay host, `html`, `body`.

### Highlight mode
Native selection stays enabled on the host (capture layer uses `pointer-events: none` in this mode and listens to `selectionchange` on the document). When a non-collapsed selection ends (mouseup / keyup), show an **Annotate** chip at the end of the selection; click or `⌘↵` opens the popup with the quote shown. A selection crossing block boundaries is one annotation whose container is the nearest common block (spec 09 §5); only a selection whose common ancestor would be `body` is refused, with the chip reading "that is the whole page". Existing text annotations are highlighted; hovering shows the marker and the comment card.

### Draw mode
Drawing happens on the SVG layer in document coordinates. Brush points are sampled at ≥ 2 px spacing, smoothed on render. Arrow/rect/ellipse are drag-to-size. Label: click to place, inline `contenteditable` in the shadow DOM, `Enter` commits, `Esc` cancels. Eraser removes a whole stroke on hit. Undo/redo stack per pending drawing. When the user clicks **Annotate** (chip that appears near the drawing's bounding box after the first stroke) or presses `⌘↵`, the popup opens; on save, capture the screenshot (spec 02.4) with the strokes composited, POST it, then create the annotation with the `PageTarget`. Show a 1-line toast if the capture failed ("Saved without screenshot; strokes kept").

## Popup

Shared for all modes.

```
› button "Save Changes"                       breadcrumb, mono, ink-2   (text: › text in p.lede · page: › drawing over 3 elements)
"Cancel anytime, no questions asked"           quote or first element text, italic, ink-2, max 3 lines (text/page only)
┌────────────────────────────────────────┐
│ What should change?                    │      textarea, autogrow 2–8 lines, autofocus
└────────────────────────────────────────┘
[detail ▾]                 Cancel   Add (⌘↵)   in immediate mode the primary button reads Send
```

`detail` is a small disclosure showing the selector(s), rect, and the styles subset (element mode) so the user can check what the agent will see. Escape cancels. Clicking outside cancels only if the textarea is empty; otherwise it stays.

After Add in batch mode: the marker appears with dashed `draft` styling, badge increments, popup closes, the mode stays active. In immediate mode the annotation is POSTed as `sent` and a batch of one is created.

## Markers and hover cards

Pin (marker) at the top-right corner of the element rect (or end of the text range, or top-left of the page region), numbered, status-colored. Hover a marker or a highlight: a card shows the comment, status pill, and for `review` the agent's summary and an **Approve** button, for `question` the question and an **Answer** field. Click a marker: opens the panel scrolled to that row. Right-click or `⌫` on a focused draft marker: delete (draft only).

Anchor states: `moved` markers get a dotted ring and a tooltip "text moved, check the highlight"; `lost` annotations have no marker and are listed in the panel with a "lost" chip and a "locate" action that scrolls to the container if it still exists.

## Send dialog (batch mode)

Triggered by Send. Lists the drafts on this route as one-line rows (number, mode glyph, first 60 chars), an optional textarea "Anything the agent should know about this batch?", and **Send N annotations**. Creates the batch via `POST /__annot/batches`. Drafts become `sent` and their markers turn solid. A toast: "Sent. Waiting for the agent." Drafts on other routes are not included; the dialog says how many exist elsewhere.

## Panel (drawer)

Header: route (mono), counts by status, "all routes" toggle, close.
Filter chips: Needs you (question + review, default when non-empty) · Open (draft, sent, acknowledged) · Done (approved) · All.
Row: number, mode glyph, status bar color, target one-liner (mono, truncated), comment, thread preview (last message, role-colored), timestamp relative. Expand to show the full thread with role labels, an answer/comment field, and actions by status:

- `draft`: Edit, Delete, Send this one.
- `sent` / `acknowledged`: Edit comment (appends a comment message), no delete.
- `question`: Answer field, **Answer** (→ acknowledged).
- `review`: agent summary or decline reason, **Approve**, **Reopen** with a required comment.
- `approved`: muted, **Reopen**.

Footer: **Approve all in review** (count) with an undo toast for 6 s, and **Send drafts** (batch mode).

Clicking a row scrolls the page so the target is centered and flashes the highlight once.

## Settings (popover from the gear)

Send mode: batch / immediate. Scheme: auto / light / dark. Accent: a swatch row of six derived suggestions plus a native color input, and "follow host". Detail level for the agent: compact / standard / detailed. Block page interactions. Marker visibility default. Density. Reset pill position. Version and a link to the docs.

## Keyboard summary

`⌥A` is the only global binding and opens the command palette; everything else is scoped to an active mode or to a focused surface — spec 09 §2. Scoped: `E` `H` `D` modes · `Esc` exit mode / close popup / close panel · `⌘↵` add or send · `I` panel · `⇧P` pause · `⌘Z` `⇧⌘Z` in Draw mode · `1`–`6` drawing tools · `⌫` delete focused draft · `?` shows the sheet. Shortcuts are ignored while typing in the host page (focus inside an input/textarea/contenteditable outside the overlay).

## State

A single `AnnotState` class using `$state` for: `annotations` (a `SvelteMap` by id, hydrated from the route file then patched by ws events), `mode`, `drafts` derived, `drawing`, `selection`, `hover`, `popup`, `panel`, `prefs`, `connection` (`connected | polling | offline`). The theme lives on the shadow root as tokens, not in the state. Server events win over local optimistic state; keep an `optimistic` set of ids to reconcile. Offline (no `/__annot/health`): the toolbar shows a muted dot and annotations are kept in memory with a banner "dev server not reachable".

## Accessibility

Every control has a label. Focus rings use `--annot-accent-line`. Popup and panel are `role="dialog"` with focus trap and return focus on close. Markers are buttons with `aria-label="Annotation 4, review"`. Live region announces "Sent 3 annotations", "Agent asked a question on #4", "#4 ready for review".

## Acceptance criteria

- Storybook-free: `packages/svelte/dev/` has a Vite page with the demo host markup and a mock `/__annot` middleware (or points at `apps/demo`). Every screen above is reachable there.
- Unit tests (vitest + happy-dom) for `AnnotState` reconciliation, keyboard dispatch rules, marker placement math, re-anchoring states, and rect merging for text highlights.
- No `querySelector` into the host that sets attributes or classes; grep-able rule enforced by a lint script `scripts/no-host-mutation.mjs` that fails on `classList.add|setAttribute|surroundContents|innerHTML =` used on anything outside the shadow root.
- The overlay renders correctly on a host with aggressive global CSS (`* { all: unset }` fixture) and on a `dark` host with a light accent.

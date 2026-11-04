# 04 · Svelte overlay

Owner: `packages/svelte`. Svelte 5, runes. `<annot-overlay>` is a hand-written custom element that mounts `Annotator.svelte` into an open shadow root, rather than a component compiled with `customElement: true`: the overlay needs to own the shadow root, the host element's inline style and the props, and that stays true in any bundler. Also export the plain component `Annotator.svelte` and a `mount(options)` function. Peer deps: `svelte ^5`.

## Mounting

- Auto: the Vite plugin sets `globalThis.__ANNOT_OPTIONS__` (and optionally `globalThis.__ANNOT_HOT__ = import.meta.hot`), then imports `@llm-ui-annotation/svelte/auto`, which appends `<annot-overlay>` to `body` once `DOMContentLoaded`. A host that imports the module itself calls `autoMount(options)` synchronously and wins. Attributes: `accent`, `scheme`, `density`, `route-key` (optional override of `location.pathname`), `send-mode`, `base-path`, `mode`.
- Manual: `<Annotator accent="#2C8A85" />` anywhere in the host app, dev only (`import.meta.env.DEV`).
- Transport: `fetch` to `/__annot/*` and `import.meta.hot.on('annot:*')` when available; else poll `/__annot/events?since=` every 2 s. The overlay never writes localStorage for annotations, only for UI prefs (`annot:prefs`): pill position, scheme override, send mode, detail level, last mode, panel open.

## Layers inside the shadow root

```
<div class="annot-root" data-scheme>           tokens live here
  <svg class="layer highlights">                element outlines, text highlight rects
  <div class="layer markers">                   numbered pins, hover cards (the class name keeps the old word)
  <div class="layer capture">                   full-viewport pointer catcher while a mode is active (transparent)
  <Popup/> <Panel/> <Toolbar/> <Toasts/>
</div>
```

All layers are `position: fixed; inset: 0; pointer-events: none` except `capture` while a mode is active and interactive children. Coordinates are document px translated by scroll on every `scroll`/`resize` (passive listeners, rAF-throttled) and on a `ResizeObserver` of `body` plus a throttled `MutationObserver` (300 ms) to re-anchor.

Never mutate the host DOM. Text highlights use the CSS Custom Highlight API when available (`CSS.highlights.set('annot-<status>', new Highlight(...ranges))`, styled from the shadow root via a `<style>` injected in the host head containing only `::highlight(annot-*)` rules, all colors from the same tokens) and fall back to rects in the `highlights` layer. Hit-testing for text always uses the rects layer (invisible, `pointer-events: auto`).

## Toolbar (the pill)

Collapsed: a single 44 px round button with the logo glyph and a badge with the count of drafts (batch mode) or unread agent activity (questions + reviews). Click expands.

Expanded, left to right — the nine controls of spec 09 §4 and nothing else:

1. Grip. The command palette has no button here: it opens on its shortcut, which Settings rebinds.
1a. In Element mode only, the picker toggle (`C`).
2. The mode segment: **Element** (`E`), **Highlight** (`H`). One active or none. Clicking the active one exits (`Esc` too).
3. Pin visibility cycle (all → dots → none), pause animations (`⇧P`).
4. **Send** (`⌘↵`) with the draft count, batch mode only. Disabled when no drafts.
5. Panel toggle (`I`) with badge for questions + reviews.
6. Settings (gear) · connection dot, shown only when the state is not `connected` (spec 09 §6) · Collapse (`Esc` twice or the ×).

Tooltips show label and shortcut, the key rendered as a keycap at `--annot-text-sm` (spec 09 §9). The pill is draggable by the grip at its left edge; snaps to the nearest corner on release.

**Block page interactions** (settings, default on): while a mode is active, the capture layer swallows clicks so buttons in the host do not fire. Holding `⌘`/`Ctrl` lets events through (cursor changes) so you can open a menu and then annotate inside it. Hover and selection still work with blocking on.

## Modes

### Element mode
Hover shows the devtools picture: the four box-model bands in devtools' colours, and its tooltip card above the element — node title, size, colour, font, box, contrast, accessibility (spec 12 §2). Hovering follows the pointer only while **picking** is on, which the pill toggles and `C` toggles; selecting an element with the drawer open turns it off, the way devtools leaves its picker after a pick, so the card stops chasing the cursor while you work in the panel. Entering Element mode turns it back on. **CSS Details** (settings, default on) turns that off and leaves the quiet version: a 2 px outline and a small label chip (`button "Save"`, `describeName(el)` from `core/dom`).
Clicking empty space clears the selection, and so does `Esc` before it reaches the panel. Click opens the popup anchored to the element — **unless the drawer is open on Inspect** (spec 12 §1), where a click only selects and the note comes from the Annotate chip or `⌘↵`: reading an element and annotating it are different activities, and popping a note over every click makes the inspector unusable. Drag from empty space makes a marquee: the outermost elements at least 50% inside are selected, then the selection steps down one level for as long as a single container is tiled (≥ 70% of its area) by children that are ≥ 90% inside, so a box round a card grid selects the cards and a box round one card selects the card. `⇧` extends the selection and shows an Annotate chip. Ignore the overlay host, `html`, `body`.

### Highlight mode
Native selection stays enabled on the host (capture layer uses `pointer-events: none` in this mode and listens to `selectionchange` on the document). When a non-collapsed selection ends (mouseup / keyup), show an **Annotate** chip at the end of the selection; click or `⌘↵` opens the popup with the quote shown. A selection crossing block boundaries is one annotation whose container is the nearest common block (spec 09 §5); only a selection whose common ancestor would be `body` is refused, with the chip reading "that is the whole page". Existing text annotations are highlighted; hovering shows the pin and the comment card.

## Popup

Shared for all modes.

Nothing above the note: the card is the field and two buttons.

```
┌────────────────────────────────────────┐
│ What should change?                    │      textarea, autogrow 2–8 lines, autofocus
└────────────────────────────────────────┘
[details ▾]                Add (⌘↵)  Send (⇧⌘↵)   editing a note: Save alone · immediate mode: Send alone
```

`details` is a disclosure holding everything else: the breadcrumb (`› button "Save Changes"`, mono,
ink-2), the quote or first element text, and the selector(s), rect and styles subset the agent will
see. Escape cancels. Clicking outside cancels only if the textarea is empty; otherwise it stays.

After Add in Manual mode: the pin appears with dashed `draft` styling, badge increments, popup closes, the mode stays active. A note that goes out at once — Review or Auto, or **Send** in Manual — toasts "Sent. Waiting for the agent.": the pin turning solid is easy to miss, and silence after sending reads as nothing having happened. **Send** does the same and then sends that one note as a batch of one, without going through the send dialog. In immediate mode Add and Send are the same thing, so only Send is shown.

## Pins and hover cards

The pin at the top-right corner of the element rect (or end of the text range), numbered, status-colored. Hover a pin or a highlight: a card shows the comment, status pill, and for `review` the agent's summary and an **Approve** button, for `question` the question and an **Answer** field. Click a pin: opens the panel scrolled to that row. Right-click or `⌫` on a focused draft pin: delete (draft only).

Anchor states: `moved` pins get a dotted ring and a tooltip "text moved, check the highlight"; `lost` annotations have no pin and are listed in the panel with a "lost" chip and a "locate" action that scrolls to the container if it still exists.

## Send dialog (batch mode)

Triggered by Send. Lists the drafts on this route as one-line rows (number, mode glyph, first 60 chars), an optional textarea "Anything the agent should know about this batch?", and **Send N annotations**. Creates the batch via `POST /__annot/batches`. Drafts become `sent` and their pins turn solid. A toast: "Sent. Waiting for the agent." Drafts on other routes are not included; the dialog says how many exist elsewhere.

## Panel (drawer)

Two channels, chosen by a segmented control under the header: **Notes** (everything below) and
**Inspect** (spec 12 §3). Selecting an element in Element mode switches an open drawer to Inspect and
deselecting switches back; a closed drawer stays closed, and the toggle holds the channel until the
selection changes.

Header: route (mono), "all routes" toggle, close. One chip row, not two: the counts live on the
filter chips — Needs you (question + review, default when non-empty) · Open (draft, sent,
acknowledged) · Done (approved) · All, each with its count (spec 11 §2).

Row: a selection checkbox, the mode glyph, the number, **the status as a word**, the timestamp,
then the target on its own line — the name at full length, the selector truncated after it — the
comment, a thread preview (last message, role-colored) and the row's actions (spec 09 §7) with a
`⋯` menu holding Edit, Delete and Locate. The 3 px status bar stays but is no longer the only
signal. Expand to show the full thread with role labels and the field the status calls for:

- `draft`: the thread. Send is on the row, Edit and Delete are in the `⋯` menu. Delete is offered
  whatever the status (spec 01) and asks nothing first; the toast names what went.
- `sent` / `acknowledged`: a comment field (appends a comment message), no delete.
- `question`: Answer field, **Answer** (→ acknowledged).
- `review`: **Reopen** with a required comment; Approve stays on the row.
- `approved`: muted comment, **Reopen** with a comment.

The row actions that only open a field are dropped while the row is expanded, since the field is
already there with its own button.

Footer: **Approve all in review** (count) with an undo toast for 6 s, and **Send drafts** (batch
mode). The bulk bar of spec 09 §8 is not here; it floats at the top of the list.

Clicking a row scrolls the page so the target is centered and flashes the highlight once.

## Settings (popover from the gear)

Command palette key (click, then press a chord; persisted). **Send mode**, a segment of three with the chosen one's sentence under it: *Manual* — notes wait as drafts until you send them; *Review* — auto send notes, you approve changes; *Auto* — auto send notes, auto approved. **Questions the agent may ask**, a segment of four on the same pattern: *None* (the agent decides and says what it chose), *Rarely* (only when blocked), *Sometimes* (when the answer would change the work), *Freely*. The level rides on the batch and is rendered for the agent (spec 06). Both are segments and not radio groups: three or four short words in one row, the meaning of the current choice underneath, is less furniture than a stack of dots and reads faster. Scheme: auto / light / dark. Accent: a swatch row of six derived suggestions plus a native color input, and "follow host". Detail level for the agent: compact / standard / detailed. Pin visibility default. Density. Two switches: **CSS Details** and **Block Page Interactions**. Reset pill position. Version and a link to the docs.

Switches follow the shadcn switch: a `role="switch"` button carrying `data-state`, a track that fills with the accent when checked and a thumb that slides.

## Keyboard summary

`⌥A` is the only global binding and opens the command palette; everything else is scoped to an active mode or to a focused surface — spec 09 §2. Scoped: `E` `H` modes · `Esc` · `⌘↵` add or send · `I` panel · `C` point at elements · `↑↓←→` walk the tree · `⇧P` pause · `⌫` delete focused draft · `?` shows the sheet.

**Escape** closes what is on top of the mode, then the mode, then the pill: the palette, the popup, a dialog, the mode, the toolbar. It never touches the panel — the panel is opened and closed deliberately, from the toolbar or `I` — and it does not clear the element selection on its own, because leaving the mode already does. One press in a mode with nothing open means one thing: you are out of the mode. Shortcuts are ignored while typing in the host page (focus inside an input/textarea/contenteditable outside the overlay).

## State

A single `AnnotState` class using `$state` for: `annotations` (a `SvelteMap` by id, hydrated from the route file then patched by ws events), `mode`, `drafts` derived, `selection`, `hover`, `popup`, `panel`, `prefs`, `connection` (`connected | polling | offline`). The theme lives on the shadow root as tokens, not in the state. Server events win over local optimistic state; keep an `optimistic` set of ids to reconcile. Offline (no `/__annot/health`): the toolbar shows a muted dot and annotations are kept in memory with a banner "dev server not reachable".

## Accessibility

Every control has a label. Focus rings use `--annot-accent-line`. Popup and panel are `role="dialog"` with focus trap and return focus on close. Markers are buttons with `aria-label="Annotation 4, review"`. Live region announces "Sent 3 annotations", "Agent asked a question on #4", "#4 ready for review".

## Acceptance criteria

- Storybook-free: `packages/svelte/dev/` has a Vite page with the demo host markup and a mock `/__annot` middleware (or points at `apps/demo`). Every screen above is reachable there.
- Unit tests (vitest + happy-dom) for `AnnotState` reconciliation, keyboard dispatch rules, pin placement math, re-anchoring states, and rect merging for text highlights.
- No `querySelector` into the host that sets attributes or classes; grep-able rule enforced by a lint script `scripts/no-host-mutation.mjs` that fails on `classList.add|setAttribute|surroundContents|innerHTML =` used on anything outside the shadow root.
- The overlay renders correctly on a host with aggressive global CSS (`* { all: unset }` fixture) and on a `dark` host with a light accent.

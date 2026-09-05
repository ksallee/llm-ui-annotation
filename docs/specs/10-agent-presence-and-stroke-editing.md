# 10 · Agent presence and stroke editing

Both items come from the owner using the tool. Not started; this is the brief.

## 1. Say whether an agent is listening

The owner sent a batch and nothing happened. The send was correct — created, sent, `batch.sent` on disk — but no process was running `annot watch`, and the overlay said *"Sent. Waiting for the agent."* That sentence is a lie when nothing is attached, and it is the one thing the UI must not lie about: the entire premise is that you hand work off to something else.

The plugin already knows. `GET /__annot/events/stream` is the agent's connection, so the count of open SSE clients is the answer.

- The plugin tracks open stream clients and pushes `annot:agents` with `{ count, since }` on change. `GET /__annot/health` also reports it, so the CLI's `doctor` can say it.
- `AnnotState` gains `agents: number`. The toolbar's send button and the panel header show it.
- Copy, when zero: the send toast reads **"Sent. No agent is watching — run `annot watch` in your project."** with the command selectable. When one or more: **"Sent. Waiting for the agent."** as today.
- The panel header shows a small presence line: `agent watching` / `no agent watching`. This replaces nothing; the dev-server connection dot from spec 09 §7 is a separate fact and both can be true or false independently.
- An annotation that has been `sent` for more than 60 s with no agent attached gets a quiet hint on its row, not a modal.

A cursor file (`<dir>/.cursor-<agent>`) proves an agent ran at some point, which is weaker but survives restarts; use it only to distinguish "no agent has ever run here" from "the agent is not running right now", and say which in the empty state.

## 2. Select, move and resize what you drew

A stroke today is write-once: undo, or erase the whole thing. Any drawing that is nearly right has to be redone.

- **Select**: in Draw, a Select tool (`V`, first in the bar) hit-tests strokes. Click selects, `⇧`-click extends, drag on empty canvas marquees. Selected strokes get a thin `--annot-accent-line` bounding box with handles.
- **Move**: drag the selection. Arrow keys nudge 1 px, `⇧` 10 px.
- **Resize**: eight handles scale the selection's bounding box; every point in every selected stroke transforms with it. `⇧` preserves the aspect ratio. Brush points scale, arrow endpoints scale, rect and ellipse rects scale, caption `at` moves but its `size` does not scale unless the handle is a corner.
- **Restyle**: with a selection, the colour swatches and width steps apply to it instead of setting the next stroke's defaults.
- **Delete**: `⌫` removes the selection. The eraser stays for the single-click case.
- **The whole drawing as one object**: `⌘A` in Draw selects every stroke, so the drawing can be
  moved, scaled, restyled or deleted as a unit. Dragging inside the region box with nothing selected
  does the same thing — the box is the drawing's handle, not just the capture bounds. `Clear drawing`
  stays as the one-click destructive path, but it is no longer the only way to get rid of a drawing
  you want to reposition instead.
- Undo/redo covers move, resize, restyle and delete as single steps, not per-point.

`strokeBounds` already gives the box. The transform is a pure function over `Stroke[]` and belongs in `packages/core/src/dom/strokes.ts` — `transformStrokes(strokes, from: Rect, to: Rect): Stroke[]` — so the canvas renderer and the SVG layer stay in agreement and it is unit-testable without a DOM.

Interaction with spec 09 §6: the drawing region and a stroke selection are different things and must not fight. The region's handles only appear when nothing is selected; selecting a stroke hides them.

## Acceptance criteria

- With no agent attached, sending shows the "no agent is watching" copy and names the command; starting `annot watch` flips the presence line within 2 s without a reload; stopping it flips back.
- `annot doctor` reports the number of attached agents.
- A brush stroke, an arrow, a rect and a caption can be selected together, moved, and scaled; every point ends where the bounding box says it should, asserted against `transformStrokes` in a unit test.
- Undo after a resize restores the previous geometry in one step.
- Scaling a selection to a degenerate box is clamped, not allowed to produce NaN.
- Region handles and stroke handles are never both on screen.
- `⌘A` in Draw selects every stroke; dragging then moves the whole drawing, and `⌫` removes it in one
  undoable step.
- Moving the whole drawing updates `PageTarget.region` and the intersecting element list with it, so
  the annotation still points at what is under the marks.

# Landscape: what exists, what to borrow, what to avoid

Researched 2026-09-05. Three sources: agent-ui-annotation (the tool we are improving on), agentation (design inspiration), and the sit_hathor reader (our own prototype of the agent loop).

## agent-ui-annotation (YeomansIII)

- TypeScript, Vite, Web Component core with adapters for vanilla, React, Vue 3, Svelte 5, Angular. MIT.
- Modes: click element, drag multi-select, freeze animations. No text mode, no drawing.
- Output: markdown to clipboard at four detail levels (compact, standard, detailed, forensic). Standard example:
  ```
  ## Page Feedback: /dashboard
  ### 1. button "Save"
  **Location:** form > .actions > button
  **Component:** App (App.tsx:12) > SaveForm (SaveForm.tsx:8)
  **Feedback:** Change color to blue
  ```
- Agent link: clipboard only. `onCopy`/`onAnnotationCreate` callbacks. Persists in localStorage for 7 days.
- Theming: `theme: light|dark|auto` plus one `annotationColor` (default `#AF52DE`, seven presets). Look at `src/themes/variables.ts`: the accent only feeds `--as-accent`, `--as-accent-hover`, `--as-accent-light`. Status colors, hover outlines, popup chrome, marker fills are separate fixed values. That is the bug the user noticed: choosing a marker color does not restyle highlights or the rest of the UI. Light and dark palettes are two hand-written lists, so nothing guarantees they stay in step.
- Worth borrowing: `identifier.ts` (human names like `button "Save"`, handles inputs, links, icons-only buttons, table cells, labels), `path-generator.ts` (short selector path), `freeze.ts` (pause animations and videos with an injected stylesheet), the four output levels idea, i18n structure.
- Avoid: a monolithic 50 KB `annotation-element.ts`, mutating host DOM for markers, clipboard as the only transport, fixed theme tables.

Screenshots: `reference-screens/agent-ui-annotation-home.png`, `agent-ui-annotation-toolbar.png`.

## agentation (benjitaylor)

- React 18 only, zero runtime deps, PolyForm Shield 1.0 (not permissive; do not copy code, borrow ideas only). 4.6k stars.
- Modes: element click, text selection, drag multi-select (green markers), area select on empty space, animation pause, draw strokes (composited into a screenshot), and a "layout mode" for placement and rearrangement wireframes.
- Toolbar: dark pill, bottom-right, eight icon buttons with tooltip + shortcut (Pause `P`, markers visibility `H`, Copy `C`, Clear `X`, Layout `L`, Settings, Exit `Esc`). Settings panel pops above it: output detail, React components toggle, marker color (7 presets), clear on copy, block page interactions, MCP/webhooks.
- Popup: dark card anchored below the element, breadcrumb line `> h3 "Example Card"`, one textarea "What should change?", Cancel / Add. Numbered circular markers on the element. Hover draws an outline around the hovered element.
- Data model (AFS 1.1, their "Annotation Format Schema"): `id, comment, elementPath, element, x (% of viewport width), y (px from document top), timestamp`, optional `boundingBox, selectedText, nearbyText, cssClasses, computedStyles, accessibility, nearbyElements, fullPath, isFixed, isMultiSelect, reactComponents, sourceFile`, classification `intent: fix|change|question|approve`, `severity: blocking|important|suggestion`, lifecycle `status: pending|acknowledged|resolved|dismissed`, `resolvedBy: human|agent`, `thread: {id, role: human|agent, content, timestamp}[]`.
- Agent link: `agentation-mcp` runs an HTTP server on 4747 plus an MCP stdio server. Tools: list sessions, get pending, acknowledge, resolve, dismiss, reply, and `watch_annotations` which blocks until a batch arrives. Their "hands-free mode" is a CLAUDE.md instruction to loop on watch. The UI shows status back (resolved markers). Webhooks optional.
- Screenshot: `modern-screenshot` as optional peer dep, `domToCanvas` of the smallest element covering the region, crop, composite strokes, JPEG at 0.85, max 600 px. Falls back to strokes-only PNG.
- Worth borrowing: the visual restraint (one dark pill, one popup, small numbered markers), the status lifecycle and thread model, the blocking watch as the agent's entry point, the screenshot approach, `Cmd/Ctrl` passthrough to let clicks reach the page while a mode is active, "block page interactions" default on.
- Avoid: React coupling, MCP as the only two-way channel, everything living in one 176 KB component, the marker-color-only theming (same flaw as the other tool).

Screenshots: `reference-screens/agentation-home.png`, `agentation-toolbar-expanded.png`, `agentation-settings.png`, `agentation-popup.png`.

## sit_hathor reader (our prototype)

Svelte 5 + Vite, ~200 lines. Reads a markdown file, renders sections, lets you select a passage and write a note.

- Transport: a Vite plugin (`configureServer`) exposes `GET /__doc`, `GET/POST /__notes`, `PUT/DELETE /__notes/:id`. Notes go to `<doc>.notes.json`; every new or revised note is appended as one JSON line to `<doc>.notes.log`. `fs.watchFile` on both files pushes `doc` and `notes` custom events over Vite's websocket, so the page updates when the agent edits either file.
- Agent side: the agent reads the log and writes `"status": "handled"` plus `handledAt` into the json. Statuses `open → handled → done`; the user clicks Valider to reach `done`, which removes the highlight. Rewriting a note keeps a `history` and resets it to `open`.
- Anchoring: `{pi (paragraph index), start, end, quote, section}`. Re-anchor order: exact offsets in the recorded paragraph, quote anywhere, 30-char prefix, whole paragraph flagged `moved` (dashed outline).
- Highlights wrap text in `<mark>` via `Range.surroundContents`, rebuilt from the parsed HTML each time. Fine for a reader that owns its DOM; not acceptable inside someone else's Svelte app.
- Worth keeping: the whole file-based loop, the three-state lifecycle with "done hides the highlight", the notes panel with filters and counts, the fuzzy re-anchor ladder, hot reload of both doc and notes, the calm serif design (Literata/Fraunces, oklch-ish warm neutrals, single teal accent).

## Conclusions that shaped the specs

1. Files are enough. The reader proved it: json for state, jsonl for events, the dev server as the single writer, websocket push for the UI. The CLI's `watch` command exits when a batch arrives, which is exactly what Claude Code's `run_in_background` Bash needs to wake the agent. No MCP server, no port to remember.
2. Theming has to be derived, not enumerated. Both references have the same flaw. One accent in, full palette out, in oklch, with status hues locked to the accent's lightness and chroma.
3. Never touch the host DOM. Both references mutate or overlay in the light DOM. We render in a shadow-DOM custom element and use overlay rects / CSS Custom Highlight API for text.
4. Keep agentation's UI vocabulary (pill, popup, markers, shortcuts) and add the two things it lacks for our flow: a mode switcher (Element / Text / Page) and a side panel for threads and review.

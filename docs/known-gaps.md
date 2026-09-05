# Known gaps

Everything in the tree that does not work, or works but not as a spec says. Written by the
integration pass over `0.1.0`; the package READMEs point here instead of keeping their own lists.

Each entry is one line of what breaks, then **bug** (should work, does not), **unimplemented** (a
spec asks for it, nobody built it) or **non-goal** (deliberate, recorded so nobody re-discovers it).

## packages/core

- `styles` is empty for any element styled by a global tag rule: the UA-default probe is a bare
  element appended to `body`, so it inherits the page's own `p { … }` and every author value is
  suppressed as "same as default". On a page that styles tags rather than classes the agent gets
  `width` and `height` and nothing else. **bug** — spec 02's probe rule is the cause, so fixing it
  means changing the spec too (probe inside an iframe with no author CSS, or drop the diff rule).
- `border: 0px none <color>` and other no-op values reach the agent as noise; `EMPTY` filters
  `0px` and `none` alone, not the shorthand that combines them. **bug**, cosmetic.
- `Annotation.anchorState` is documented as browser-only and not persisted, but nothing strips it
  and `validateAnnotation` accepts it. It is safe only because the overlay keeps anchor state in a
  side map and never sets the field. **unimplemented** — the plugin should drop it on write.
- Six response types in `src/protocol/api.ts` (`CreateAnnotationRequest`, `AnnotationResponse`,
  `BatchResponse`, `RouteResponse`, `EventsResponse`, `DeleteResponse`) have no importer anywhere.
  **non-goal** — they document the wire shapes; keep or delete deliberately, do not let them rot.
- `@llm-ui-annotation/core/dom` pulls `./theme` in transitively (`dom/oklch.ts` re-exports from
  `theme/color.ts`, which carries the 148-colour name table), so the four-entry split is three in
  practice. **non-goal** — `toOklch` in the style subset is the reason; nothing tests otherwise.
- `test/entries.test.ts` enforces the browser/node split by grepping import statements, and only
  imports `.` and `./model` at runtime. It would not catch `await import('node:fs')` or a
  transitive builtin reaching `./dom` or `./theme`. **unimplemented** — there are no violations
  today; the guard is weaker than it reads.

## packages/svelte

- Holding `⌘`/`Ctrl` passes clicks through to the host, but the cursor does not change to say so —
  the passthrough rule turns off `pointer-events`, which takes the crosshair with it.
  **unimplemented**, spec 09 §2 names it.
- Clicking a panel row scrolls to the target and opens its card but does not flash the highlight.
  **unimplemented**, spec 04.
- Nothing type-checks the 20 `.svelte` files: `check` runs `tsc`, which ignores them, and
  `svelte-check` is not installed. The repo's TypeScript-strict rule does not reach most of the UI.
  **bug**, toolchain. The highest-value thing on this page.
- Page screenshots need an injected capture backend (`modern-screenshot`); without one the
  annotation saves its strokes and toasts "Saved without screenshot". **non-goal**, spec 02.4.
- In immediate send mode the batch is announced before the screenshot is captured and POSTed, so an
  agent whose `annot watch` collection window (1.5 s) closes first reads
  `screenshot: none (capture failed)` for an annotation that does have one. `apps/reader` runs in
  exactly this mode. **bug**, narrow race.
- Bulk undo is offered for Approve only; Reopen, Send and Delete have no undo toast. **non-goal**,
  spec 09 §9 only requires it for Approve.
- Pin visibility has no keyboard binding (pill, palette and settings only). **non-goal**.
- `sendMode: 'immediate'` has no debounce: three fast annotations are three batches. **non-goal**,
  spec 04 mandates a batch of one.
- `AnnotClient.route()` never sends `?route=`, which the plugin uses to name a route file that does
  not exist yet, so the overlay hydrates a `RouteFile` whose `route` is `''`. Harmless today because
  nothing reads it. **bug**, latent.
- The overlay never reads `protocolVersion`, though the plugin puts it in `__ANNOT_OPTIONS__`. A
  version-skewed overlay writes v2 annotations at a v1 server with no warning. **unimplemented**.
- Compact density scales the spacing and chrome tokens; a handful of control sizes are hard-coded px
  and do not follow. **non-goal**, matches spec 03.

## packages/vite-plugin

- No origin or CSRF protection on the wire API. Any page the developer visits while the dev server
  runs can create annotations, send batches, move items through the loop and overwrite a screenshot
  inside the annotations dir — `Content-Type: text/plain` with PNG bytes is a CORS-simple request,
  so there is no preflight to stop it. Path traversal out of the dir is fixed; the rest is not.
  **bug** — the fix is an `Origin`/`Host` check, which needs a decision about what a dev server
  should trust.
- `POST /annotations` is an upsert that takes `status`, `thread`, `batch` and `resolution` from the
  client, so a stale tab re-posting a cached draft would reset an annotation the agent already moved
  to `review` and wipe its thread. No client does this today; the server allows it. **bug**, latent.
- `annot reply` writes the route file directly even when the dev server is up (no wire verb appends
  a message without a transition). A plugin write between the CLI's read and its write is lost.
  **bug**, narrow race; spec 06 records the direct write but not the window.
- The websocket channel names (`annot:annotation`, `annot:deleted`, `annot:route`) are string
  literals in this package and again in `packages/svelte`; core owns the file protocol but not these.
  A typo on either side is a silent no-push. **unimplemented**.
- The on-disk JSON rendering is defined twice — `JSON.stringify(file, null, 2)` here for the
  mtime cache compare, `writeJson` in `core/node` for what the CLI writes. Change the indent in one
  and the plugin stops recognising its own file as unchanged. **bug**, latent.
- The startup log prints the annotations dir relative to the Vite root, so an `ANNOT_DIR` outside
  the project logs as `../../../../../…`. **bug**, cosmetic.

## packages/cli

- `annot watch` against a running dev server returns 124 the moment the SSE stream ends, rather than
  blocking for `--timeout`: the HTTP transport is a single pass over one response body with no
  reconnect, while the file transport loops until aborted. A dev-server restart turns the documented
  agent loop into a hot restart loop. **bug**.
- The health check compares `protocolVersion` with strict equality instead of consulting
  `SUPPORTED_PROTOCOL_VERSIONS`, so a v1 server and a v2 CLI silently fall back to direct file
  writes under the generic "(dev server not running…)" notice. **bug**.
- `annot init --gitignore` always writes `.annotations/`, with no idea what the Vite config's `dir`
  says, while the plugin warns using the configured dir. With a non-default `dir` — which
  `apps/reader` uses — following the plugin's advice does not silence the plugin. **bug**.
- Status counts are re-implemented here and in `packages/svelte` as object literals rather than
  built from core's `STATUSES`; only the plugin uses the exported list. A seventh status would
  compile and then count wrong. **bug**, latent.
- `renderCommentMarkdown` is defined locally while its three siblings live in core's markdown
  module. **non-goal**, small duplication.
- Neither `VERSION` constant (`cli/src/run.ts`, `svelte/src/version.ts`) reads `package.json`; both
  are hand-maintained strings. **bug**, cosmetic.

## Cross-package

- The route-key rule exists twice with different behaviour: the overlay's `routeOf` uses `new URL`
  with no base and yields `/` for a relative URL; the plugin's `defaultRouteKey` supplies a base and
  handles it. The two `routeKey` options also share a name while having different types (a string in
  the overlay, a function in the plugin) — `apps/reader` sets both and only the overlay's takes
  effect. **bug**, latent.
- `OverlayOptions` is declared twice for one `globalThis.__ANNOT_OPTIONS__` blob: ten fields with a
  narrow `scheme` union in `packages/svelte`, four fields with `scheme: string` in the plugin that
  writes it. **bug**, latent.
- `packages/svelte/src/options.ts` re-lists `MODES`, `SCHEMES` and `SEND_MODES` that core already
  exports, in the same file that imports the `Mode` type from core. **non-goal**, duplication.
- The markdown the agent reads drops `url`, `viewport`, `createdAt`/`updatedAt`/`sentAt`/`batch`, a
  text target's `container.context`, and the `rect`/`role`/`attrs` of the elements under a drawing —
  at every level, `detailed` included. Without `viewport` there is no width to interpret the
  document-pixel rects against. **unimplemented**.
- Only `packages/core` has a v1 protocol fixture; neither the plugin nor the CLI tests one, though
  both claim to accept `SUPPORTED_PROTOCOL_VERSIONS`. Verified by hand for `0.1.0`: a v1 file loads,
  renders, transitions and stays v1. **unimplemented**.

## apps/reader

- The rail is English only; the prototype's French copy did not move over. **non-goal**.
- One `DOC` per dev server; multi-document sessions are out of scope. **non-goal**.
- Draw mode saves strokes without a screenshot — the reader does not install the optional
  `modern-screenshot` peer. **non-goal**.

## apps/demo

Nothing outstanding. The four deviations the README recorded against spec 08 are all reconciled:
the `modern-screenshot` dependency, the "no highlights remain" wording, the two suites spec 09 added
(spec 08 now lists all twelve), and the freeze-mode second `<style data-annot-*>` node.

## Fixed since the READMEs were written

Kept so nobody re-files them.

- The `packages/svelte` barrel mounted the overlay on import; `auto.ts` is now the only entry with
  that side effect, and the reader's synchronous-`autoMount` workaround is gone.
- `modern-screenshot` broke Vite's import analysis when absent; the specifier is read at call time
  behind `/* @vite-ignore */`, and the reader's local stub plugin is gone.
- `GET /routes/:slug` read, and `POST /screenshots/:id` wrote, any path on the machine.
- Two tabs on one route could both take display `#5`, making `annot ack #5` ambiguous forever.
- The words a user typed onto a drawing never reached the agent.
- A multi-line text highlight changed shape between creation and its first re-anchor.

## Found by hand, specced in docs/specs/10

- **The overlay cannot tell whether an agent is listening** (bug). Sending shows "Waiting for the agent" even when no `annot watch` is attached, so a correct send looks like a failure. The plugin already knows the answer from its open SSE clients.
- **Strokes cannot be selected, moved, resized or restyled** (unimplemented). Draw is write-once: undo or erase the whole stroke. The resizable region from spec 09 §6 is the capture box, not the marks.

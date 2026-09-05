# 02 · Core algorithms: selectors, element description, text anchoring, capture helpers

Owner: `packages/core/src/dom/`. Pure functions that take a `Document`/`Element`/`Range` and return data from spec 01. No `window` at import time. Tests in happy-dom (or jsdom where happy-dom lacks an API) with HTML fixtures.

## 2.1 Selector generation → `describeElement(el, opts): ElementRef`

Goal: a selector the agent can grep for, that survives a re-render, and that a human can read.

Preference ladder, stop at the first that is unique in `el.getRootNode()`:

1. `#id` when the id is not numeric-looking and not generated (`/^(svelte-|radix-|headlessui-|:r|_|__)/`, or containing 6+ consecutive digits/hex).
2. `[data-testid=…]`, `[data-test=…]`, `[data-cy=…]`, `[data-annot-id=…]`, `[data-annot-block=…]`.
3. `tag[name=…]`, `tag[aria-label=…]`, `a[href=…]` (exact for a plain path, `a[href*=…]` on the path when the href is absolute or carries a query), `img[alt=…]`, `input[type=…][placeholder=…]`.
4. `tag.class1.class2` using at most two stable classes. A class is unstable if it matches `/^(svelte-[a-z0-9]+|css-[a-z0-9]+|sc-|_[a-z0-9]{5,}|[a-z]+-[0-9a-f]{5,}$|[A-Za-z]+__[a-z0-9]{5,})/` or is longer than 40 chars, or is purely utility (Tailwind heuristics: contains `:` or `[` or `/`, matches `/^(p|m|px|py|mx|my|w|h|gap|text|bg|flex|grid|items|justify|rounded|border|shadow|font|leading|tracking)-/`, or is one of the bare utility words `flex grid block inline hidden border rounded shadow container absolute relative fixed static sticky truncate italic underline uppercase lowercase capitalize antialiased`).
5. Walk up: `parentSelector > tag:nth-of-type(n)`, where `parentSelector` is computed recursively with the same ladder, capped at 5 levels. Prefer `:nth-of-type` over `:nth-child`.
6. Last resort: full path from `body` with `:nth-of-type`, stored as the last fallback.

`fallbacks`: every candidate that was unique at any level of the ladder (max 4), plus the full path. `selector` is the winner. Verify uniqueness with `querySelectorAll(...).length === 1`; verify it resolves back to `el`.

Shadow DOM: if `el` is inside an open shadow root, produce `hostSelector >>> innerSelector` (document the `>>>` convention; `resolveSelector` in core understands it). Closed shadow roots are out of scope.

`name` (human label), in order: `aria-label`, `aria-labelledby` text, associated `<label>` text (for/wrapping), visible text (trimmed to 40 chars, collapse whitespace), `alt`, `title`, `placeholder`, `href` last path segment, `value` for buttons, else empty. Format `tag "label"` (`button "Save"`, `a "Pricing"`, `input[email] "Work email"`), `h2 "Pricing"`, icon-only buttons `button (icon)` with the svg's `aria-label` or `<title>` if any. Adapt the ideas in agent-ui-annotation's `identifier.ts`, write our own.

`role`: explicit `role` attribute, else implicit from tag (`button`, `a[href]→link`, `h1-6→heading`, `input[type]→textbox|checkbox|radio|…`, `nav→navigation`, `main`, `img`, `ul/ol→list`, `li→listitem`, `table→table`, `th/td→columnheader|cell`). Small table, not a full ARIA implementation.

`rect`: `getBoundingClientRect()` translated by `scrollX/scrollY` to document coordinates, rounded to integers.

`fixed`: true if any ancestor (including self) has computed `position` of `fixed` or `sticky`.

`attrs`: whitelist `id class name type href src alt title placeholder role aria-* data-*`. Values trimmed to 100 chars. Class value has unstable classes removed (keep them in `attrs['class:raw']` only in detailed payloads).

`styles` (when `opts.styles !== false`): computed values for a subset chosen by element kind, only when different from the UA default:
- text-ish (`p h1-6 span a li label td th button input`): `color font-family font-size font-weight line-height letter-spacing text-align text-transform`
- box (all): `display position width height padding margin border-radius border background-color box-shadow opacity gap`
- layout containers (`display` flex/grid): add `flex-direction align-items justify-content grid-template-columns`
Colors are reported as `oklch()` strings via `toOklch()` from `core/theme` so the agent gets perceptual values, with the original value in parentheses when it was a named color or hex. Numbers rounded to 2 decimals. Max 20 entries. The UA default is read from a hidden probe element of the same tag appended to `body` and removed again, cached per document and tag; `width` and `height` are always reported.

`context`: `name` of parent element, previous element sibling, next element sibling (nulls allowed). Skip the overlay host element (`annot-overlay`) and `script/style`.

Also export `resolveSelector(root, selector): Element | null` (handles `>>>`) and `findElementsInRect(doc, rect, opts): ElementRef[]` for page mode: elements whose rect intersects `rect` by ≥ 30% of their own area, excluding the overlay host and its descendants, `html`, `body`, elements smaller than 8×8 or larger than 90% of the region unless nothing else matches; sort by intersection area desc; dedupe ancestors that add nothing (if a child covers ≥ 80% of the parent's intersection, drop the parent); cap at 12; compact (no styles).

## 2.2 Text anchoring → `describeRange(range): DescribeRangeResult` and `anchorText(doc, target): { range: Range; state: 'exact'|'moved' } | null`

`describeRange` returns `{ ok: true; target: TextTarget }` or `{ ok: false; reason: 'empty' | 'no-container' }`, so the refusal reason travels with the refusal. `prefix` and `suffix` are 32 normalized characters.

Normalization for `quote`, `prefix`, `suffix`, offsets: collapse runs of whitespace to one space, trim; offsets are computed against the normalized `textContent` of the container. Provide `normalize(text): { text, map: (normIndex) => rawIndex }` so a normalized offset maps back to a DOM position.

Container: the nearest ancestor-or-self of the range's `commonAncestorContainer` that is a block-level element (`p div li td th h1-6 blockquote pre section article dd dt figcaption summary`) or has `display: block|list-item|table-cell` computed. A range spanning several blocks is anchored the same way, against the block that contains them all; `quote`, `prefix`, `suffix`, `start` and `end` are computed against that container's normalized text, which runs across its blocks. The blocks actually holding selected text are recorded in `TextTarget.blocks` (document order, compact, only when there is more than one) so the agent can name them. `no-container` is the only refusal: the walk reached `body` or `html`, meaning the selection spans the page.

Re-anchor ladder (matches the reader's, named states):
1. Resolve container by `selector`, then `fallbacks`. Normalize its text.
2. `text.slice(start, end) === quote`.
3. Search `prefix + quote + suffix`, then `quote`, with the occurrence whose index is closest to `start`.
4. Search the first 30 chars of `quote` (if ≥ 12 chars) near `start`; extend to `quote.length`, clamped.
5. The same searches across every element matching `container.tag` in the document, when the container was not found *or* held no match — a fallback selector can resolve to the wrong element after a re-render.
6. `null` → the overlay shows the annotation as `lost` in the panel with the quote, no highlight.

The state is `exact` when the quote matched verbatim at the recorded offsets in the resolved container, and `moved` in every other hit, including an exact text match at a shifted offset.

Return DOM `Range` built from the normalized offsets via `map`. Export `rangeRects(range): Rect[]` (document coords, merged per line: adjacent rects on the same line with ≤ 2 px gap are unioned) for drawing overlay highlights.

## 2.3 Page-mode helpers → `strokeBounds(strokes, padding = 24): Rect`, `renderStrokes(ctx, strokes, origin, scale)`

Canvas 2D drawing of strokes for compositing onto the screenshot. `origin` is `{ x, y }`, the document coordinate the canvas top-left sits at. Brush uses quadratic smoothing between points; arrow has a filled triangular head sized `3 × width`; a label's `at` is the top-left of a 4 px padded pill filled with the stroke color, text in `size` px system-ui over a readable ink. Text width is approximated as `length × size × 0.6` rather than measured, so `strokeBounds` and `renderStrokes` agree and neither needs a live context. Colors passed through as given. Deterministic so the e2e test can snapshot.

## 2.4 Screenshot capture → `captureRegion(doc, rect, strokes, opts): Promise<Blob | null>`

Lives in core but takes an injected `domToCanvas` function (from `modern-screenshot`, an optional peer of `packages/svelte`, not of core) so core stays dep-free. Algorithm as in agentation's `screenshot.ts` but our own code: hide the overlay host, pick the smallest element covering ≥ 90% of the region (`elementsFromPoint` at the center, or a scan of `body`'s descendants where that API is missing), `domToCanvas(target, { scale: min(2, dpr), timeout: 5000 })`, crop to the region + padding, cap the longest side at 1600 px, composite strokes with `renderStrokes`, `toBlob('image/png')`. Return `null` on any failure; the caller falls back to strokes-only via `renderStrokes` on a light background. Restore overlay visibility in `finally`.

## 2.5 Freeze → `freezeAnimations(doc): () => void`

Inject a `<style data-annot-freeze>` pausing `animation-play-state` and disabling `transition` for everything except the overlay host; pause playing `<video>`s and remember them; return an `unfreeze` function that restores. Identical in intent to both references.

## Acceptance criteria

- Fixture HTML pages in `packages/core/test/fixtures/` covering: ids, test ids, Svelte hashed classes, Tailwind utility soup, repeated list items, nested shadow root, fixed header, table cells, icon-only buttons, form inputs with labels.
- `describeElement` returns a selector that resolves back to the same element for every element in every fixture (property test over `querySelectorAll('*')`).
- Selectors contain no `svelte-*` or utility classes.
- Text anchoring tests: exact, prefix/suffix disambiguation of a repeated quote, moved after an insertion before the quote, moved after an edit inside the quote, lost after deletion, container re-found via fallbacks after its class changed, a run across two blocks and across a paragraph/blockquote/paragraph, and refusal at `body`.
- `findElementsInRect` on a fixture with a card grid returns the cards and the heading, not `body` or the tiny icons.
- Stroke rendering snapshot test with a fixed set of strokes rendered to a `canvas` (node-canvas or a stub that records calls; recording calls is acceptable).

## Notes

happy-dom has no layout: `getBoundingClientRect` and `Range.getClientRects` return zeros, so the fixtures carry `data-rect` attributes the test helper installs as stub rects, and rect merging is tested on its own. `src/dom/oklch.ts` is the single import site for `toOklch` from `core/theme`.

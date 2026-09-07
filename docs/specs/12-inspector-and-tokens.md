# 12 · The inspector, and design tokens

From a hands-on session: *"css selection should show you more info about padding, margin, size, fonts — that would be super useful info… maybe a CSS side panel you can open so you can better prompt. CSS with design tokens?"*

Two things, and the second is the one that changes what the agent does.

## 1. The drawer has two channels

The right drawer is 360px and already belongs to the annotations panel. It gains a second channel rather than a second drawer.

- A segmented control at the top: **Notes** · **Inspect**.
- Selecting an element in Element mode switches an **already-open** drawer to Inspect. Deselecting, or leaving Element mode, switches back to Notes.
- A **closed** drawer stays closed. Selecting an element must not force chrome open. The channel is a function of the selection, not an event, so a drawer opened later with the element still selected opens on Inspect.
- The toggle overrides the automatic switch until the selection changes, so you can read a note while an element is selected.
- Deselecting is a click on empty space, or `Esc` — which now clears the selection before it closes the panel.

## 2. On canvas: the box model

Hovering in Element mode draws what Chrome devtools draws, as close as we can get it, because that
is the picture people already know how to read.

**The bands.** Content, padding, border and margin as nested boxes, in devtools' own colours:
`--annot-box-content` `rgba(111,168,220,.66)`, `--annot-box-padding` `rgba(147,196,125,.55)`,
`--annot-box-border` `rgba(255,229,153,.66)`, `--annot-box-margin` `rgba(246,178,107,.66)`. These are
the only tokens the accent does not reach and the only ones that do not move with the scheme — the
four hues *are* the legend, and one hue at four alphas is what made ours hard to read. Nothing is
written on the bands: no per-side numbers, no `w × h` in the middle. They draw at any size.

**The card.** A tooltip above the element (below when the top of the window is in the way), left edge
aligned with it, `pointer-events: none`, in the overlay's own surface and inks:

- the node title — `button#go.btn.primary`, tag in `--annot-element`, id in `--annot-ink`, classes in
  `--annot-ink-3` — and the border-box size as `92 × 31`. Svelte's scoping hash (`s-1a2b3c`) is
  dropped from the class list: devtools shows it, but it says nothing about the page.
- `Color` (swatch and hex), `Font` (size and first family), `Background` — its own, or the first
  ancestor that paints one — and `Shadow` when there is one; then `Margin`, `Padding`, `Gap` (flex and
  grid only) and `Border` as CSS shorthand; then `Contrast`, the WCAG ratio of the text against that
  background with ✓ or ✗ for AA, for an element with text of its own. Gap, shadow and the resolved
  background are what design feedback is actually about, which is why they are in the card and not
  only in the drawer.
- an `Accessibility` block: `Name` (`labelOf`), `Role` (`roleOf`, `generic` when there is none) and
  `Keyboard-focusable`.

The **CSS Details** switch in Settings (default on, `prefs.cssDetails`) turns all of it off and puts
back the quiet version: the 2 px outline and the small name chip.

## 3. In the drawer: the inspector

Devtools' Elements panel, in our drawer. For the selected element, in this order:

- the **node title** of §2 with the border-box size, then the tag chain to `body` and the selector, both mono.
- the **box diagram** — devtools' nested bands, `margin` outside `border` outside `padding` outside the content box, each labelled, with its four numbers on the edges they belong to and the content size in the middle. `−` for a zero side. This is the used box, read off the element; the payload's `width`/`height` are the computed CSS values and honour `box-sizing`, so the two disagree on a border-box element. Both are true.
- **Layout** — `display`, `position`, and when it is flex or grid, the direction, alignment, template and `gap`.
- **Text** — family, size, weight, line-height, letter-spacing, and the resolved text colour.
- **Appearance** — text colour, background, border colour, shadow. The background is the element's own, or the first ancestor that paints one when it is transparent: that is the colour the eye reads, and the one the contrast figure uses.
- **Accessibility** — name, role, keyboard-focusable, as in the card.
- **What the agent will see** — the exact `styles` subset that goes into the payload, verbatim.

Declarations are written the way devtools writes them: mono on both sides, a swatch on every colour,
hex for an opaque one. The region is a scroll container, so it carries `tabindex="0"` — a scrollable
region has to be reachable by keyboard.

That last section is not a nicety. `styles` comes back nearly empty for elements styled by global tag rules, because the UA-default probe inherits the page's own CSS (`docs/known-gaps.md`). Today that failure is invisible: the agent silently gets less. Showing the payload makes it obvious in a second.

## 4. Design tokens

If a page defines `--color-primary-600` and the button computes to that colour, the agent should be told the token, not just the value. Then it edits the token or reuses it, instead of pasting a hex that quietly leaves the design system.

### Resolving

`tokenMap(doc, el?): TokenMap` in `packages/core/src/dom/tokens.ts`, where `TokenMap` is a
`Map<string, string>` from normalised value to custom property name carrying one extra field,
`skipped` — the sheets that could not be read. One return value, because the inspector needs both.

- Walk `document.styleSheets`, and every rule whose selector matches an ancestor-or-self of `el`
  (`:root` and `body` match it that way, so they need no special case); without `el`, only `:root`,
  `html`, `body` and `*`. Recurse into `@media` whose condition currently matches, into `@supports`
  and other grouping rules unconditionally, and into `@import`ed sheets.
- Cross-origin sheets throw on `.cssRules` — catch, skip, and count in `skipped`. A sheet that
  returns no rules at all counts the same way.
- Collect every `--*` declaration. A name declared more than once keeps the closest ancestor's, then
  the last in cascade order. A value that is itself a `var(--other)` follows the alias, up to 8 hops.
- Normalise both sides before comparing: colours through `parseColor`/`formatOklch` from
  `core/theme`, absolute lengths and `rem` to px, `,` spacing and case collapsed. A hex that computes
  to `oklch(...)` must still match its token, and so must the `oklch(…) (#hex)` form `styles` stores.
  `em`, `%` and viewport units are compared as written, so they only ever match themselves.
- `line-height` and `letter-spacing` compute against the element's own font size, so a `1.15` token
  reaches the inspector as `41.4px` and a `-0.01em` token as `-0.36px`. Given `fontPx`,
  `resolveTokens` divides the computed value back to the ratio or em the token is written as and
  retries. Without it those two properties resolve to nothing, which is what they did before.
- Where two tokens share a value, prefer the one declared on the closest ancestor, then the shortest
  name, then alphabetical. Report one, never a list.

`declaredTokens(doc, el?): Map<string, string>` is the other half: every custom property in scope,
keyed by **name**, nothing dropped for sharing a value. `tokenMap`'s one-name-per-value rule is right
for reading a value back to its source and wrong for offering a designer their own scale — a page
where `--space-3` and `--text-xs` are both `12px` must still offer both in the type editor (spec 13).

`resolveTokens(styles, map, fontPx?): Record<string, string>` maps a property to the token that produced it.
It matches the whole value first, then, for a value of several parts (parentheses respected, so
`rgb(1, 2, 3)` stays whole), every part — and only reports the property when **every** part resolves,
joined by a space: `padding` → `--space-3 --space-4`. So `border: 1px solid var(--line)` reports
nothing, because `1px` and `solid` are literals. `describeElement` builds the map itself unless
`opts.tokens` hands it one, which is how several elements share a single walk.

### Protocol

```ts
export interface ElementRef {
  // …unchanged…
  tokens?: Record<string, string>;   // property → custom property name, when one resolves
}
```

`protocolVersion` stays **2**: additive and optional, like `attachments`.

### What the agent reads

`renderBatchMarkdown` puts the token beside the value at `standard` and `detailed`:

```
styles: background-color oklch(0.55 0.15 250) var(--color-primary-600) · padding 12px 16px var(--space-3) var(--space-4) · font-size 14px var(--text-sm)
```

A property with no token reads exactly as it does today. `annot init --claude-md` tells the agent
what the `var(…)` means: change or reuse the token, do not paste the value.

## Acceptance criteria

- Selecting an element with the drawer open shows the inspector; deselecting returns to Notes; a closed drawer stays closed.
- The toggle holds the chosen channel until the selection changes.
- Hovering a padded, margined element draws four bands with the non-zero numbers; an element under 24×24 draws none.
- On a fixture whose `:root` declares `--brand: #2c8a85` and a button using `background: var(--brand)`, the annotation's `tokens['background-color']` is `--brand` — proving a hex that computed to `oklch` still matches.
- A cross-origin stylesheet does not throw and does not stop resolution; the count of skipped sheets is reported in the inspector.
- Two tokens with the same value resolve to the one on the closer ancestor.
- An element with no tokens produces no `tokens` key at all, and its markdown is unchanged from today.
- The inspector's "what the agent will see" matches the `styles` actually stored on the annotation, byte for byte.

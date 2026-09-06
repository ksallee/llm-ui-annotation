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

Hovering in Element mode already draws an outline and a name chip. It gains the devtools reading of the box: content, padding, border and margin as nested tinted bands, with the numbers on each side that is non-zero. Content size sits in the middle as `w × h`.

Colours come from the theme, not from devtools' orange and green: `--annot-element` for content, its `-fill` at descending alpha for padding, border and margin. Suppressed under `prefers-reduced-motion`? No — it is not motion. Suppressed when the element is under 24 px in either direction, where the bands would be unreadable; the hover outline stays. The `w × h` label needs a content box of at least 56×14 to sit in without covering the side numbers — under that the drawer has the same figure.

## 3. In the drawer: the inspector

For the selected element, in this order:

- **Identity** — the name, the selector in mono, the role, and the tag chain to `body`.
- **Box** — the content size, and the four sides of padding, border, margin. This is the used box, read off the element; the payload's `width`/`height` are the computed CSS values and honour `box-sizing`, so the two disagree on a border-box element. Both are true, and the section headings say which is which.
- **Layout** — `display`, `position`, and when it is flex or grid, the direction, alignment and template.
- **Type** — family, size, weight, line-height, letter-spacing, and the resolved text colour.
- **Colour** — text, background, border, shadow.
- **What the agent will see** — the exact `styles` subset that goes into the payload, verbatim.

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
- Where two tokens share a value, prefer the one declared on the closest ancestor, then the shortest
  name, then alphabetical. Report one, never a list.

`resolveTokens(styles, map): Record<string, string>` maps a property to the token that produced it.
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

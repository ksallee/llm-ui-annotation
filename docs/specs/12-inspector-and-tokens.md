# 12 · The inspector, and design tokens

From a hands-on session: *"css selection should show you more info about padding, margin, size, fonts — that would be super useful info… maybe a CSS side panel you can open so you can better prompt. CSS with design tokens?"*

Two things, and the second is the one that changes what the agent does.

## 1. The drawer has two channels

The right drawer is 360px and already belongs to the annotations panel. It gains a second channel rather than a second drawer.

- A segmented control at the top: **Notes** · **Inspect**.
- Selecting an element in Element mode switches an **already-open** drawer to Inspect. Deselecting, or leaving Element mode, switches back to Notes.
- A **closed** drawer stays closed. Selecting an element must not force chrome open.
- The toggle overrides the automatic switch until the selection changes, so you can read a note while an element is selected.

## 2. On canvas: the box model

Hovering in Element mode already draws an outline and a name chip. It gains the devtools reading of the box: content, padding, border and margin as nested tinted bands, with the numbers on each side that is non-zero. Content size sits in the middle as `w × h`.

Colours come from the theme, not from devtools' orange and green: `--annot-element` for content, its `-fill` at descending alpha for padding and margin. Suppressed under `prefers-reduced-motion`? No — it is not motion. Suppressed when the element is smaller than 24×24, where the bands would be unreadable.

## 3. In the drawer: the inspector

For the selected element, in this order:

- **Identity** — the name, the selector in mono, the role, and the tag chain to `body`.
- **Box** — width, height, and the four sides of padding, border, margin.
- **Layout** — `display`, `position`, and when it is flex or grid, the direction, alignment and template.
- **Type** — family, size, weight, line-height, letter-spacing, and the resolved text colour.
- **Colour** — text, background, border, shadow.
- **What the agent will see** — the exact `styles` subset that goes into the payload, verbatim.

That last section is not a nicety. `styles` comes back nearly empty for elements styled by global tag rules, because the UA-default probe inherits the page's own CSS (`docs/known-gaps.md`). Today that failure is invisible: the agent silently gets less. Showing the payload makes it obvious in a second.

## 4. Design tokens

If a page defines `--color-primary-600` and the button computes to that colour, the agent should be told the token, not just the value. Then it edits the token or reuses it, instead of pasting a hex that quietly leaves the design system.

### Resolving

`tokenMap(doc): Map<string, string>` in `packages/core/src/dom/tokens.ts`:

- Walk `document.styleSheets`, and every rule whose selector matches `:root`, `html`, `body` or a class on an ancestor of the element. Cross-origin sheets throw on `.cssRules` — catch and skip, and say how many were skipped.
- Collect every `--*` declaration and its declared value.
- Normalise both sides before comparing: colours through `toOklch` from `core/theme`, lengths to px, shorthands expanded. A hex that computes to `oklch(...)` must still match its token.
- Where two tokens share a value, prefer the one declared on the closest ancestor, then the shortest name. Report one, never a list.

`resolveTokens(styles, map): Record<string, string>` maps a property to the token that produced it.

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

A property with no token reads exactly as it does today.

## Acceptance criteria

- Selecting an element with the drawer open shows the inspector; deselecting returns to Notes; a closed drawer stays closed.
- The toggle holds the chosen channel until the selection changes.
- Hovering a padded, margined element draws four bands with the non-zero numbers; an element under 24×24 draws none.
- On a fixture whose `:root` declares `--brand: #2c8a85` and a button using `background: var(--brand)`, the annotation's `tokens['background-color']` is `--brand` — proving a hex that computed to `oklch` still matches.
- A cross-origin stylesheet does not throw and does not stop resolution; the count of skipped sheets is reported in the inspector.
- Two tokens with the same value resolve to the one on the closer ancestor.
- An element with no tokens produces no `tokens` key at all, and its markdown is unchanged from today.
- The inspector's "what the agent will see" matches the `styles` actually stored on the annotation, byte for byte.

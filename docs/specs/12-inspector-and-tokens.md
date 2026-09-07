# 12 · The inspector, and design tokens

From a hands-on session: *"css selection should show you more info about padding, margin, size, fonts — that would be super useful info… maybe a CSS side panel you can open so you can better prompt. CSS with design tokens?"*

Two things, and the second is the one that changes what the agent does.

## 1. The drawer has two channels

The right drawer is 360px and already belongs to the annotations panel. It gains a second channel rather than a second drawer.

- A segmented control at the top: **Notes** · **Inspect**.
- Selecting an element in Element mode switches an **already-open** drawer to Inspect. Deselecting, or leaving Element mode, switches back to Notes.
- A **closed** drawer stays closed. Selecting an element must not force chrome open. The channel is a function of the selection, not an event, so a drawer opened later with the element still selected opens on Inspect.
- The toggle overrides the automatic switch until the selection changes, so you can read a note while an element is selected.
- Deselecting is a click on empty space. `Esc` does not: it leaves Element mode, which clears the selection anyway (spec 04).
- Selecting an element with the drawer open stops the picker: the hover outline and card go, the
  selection highlight stays, and the panel holds still while you work in it. `C`, or the picker
  button in the drawer's inspect bar with its key printed on it, starts it again without leaving
  Element mode. The button lives with the readings it feeds, not in the pill.
- With a selection, the arrows walk the DOM instead of scrolling the page: `↑` parent, `↓` first
  child, `←` `→` siblings, skipping the overlay, `html` and `body`, and bringing the new element into
  view. Nothing selected, or another mode, and the page keeps its scroll.
- Scrolling drops the hover: the pointer has not moved, so what was under it no longer is, and a card
  describing the wrong element is worse than no card. The next pointer move brings it back.
- While the drawer is open on anything but Notes, `state.inspecting` is true and a click on the page
  selects **without** opening the note popup; an Annotate chip appears over the selection instead, and
  `⌘↵` still opens it. The panel is where you work on an element; a note is a separate decision.

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

Devtools' Elements panel, in our drawer. One list for the selected element, in this order:

- the **node title** of §2 with the border-box size, then the tag chain to `body` and the selector, both mono.
- the **box diagram** — devtools' nested bands, `margin` outside `border` outside `padding` outside the content box, each labelled, with its four numbers on the edges they belong to and the content size in the middle. `−` for a zero side. This is the used box, read off the element; the payload's `width`/`height` are the computed CSS values and honour `box-sizing`, so the two disagree on a border-box element. Both are true.
- **Layout** — `display`, `position`, and when it is flex or grid, the direction, alignment, template and `gap`. Read-only: these are facts about the element, not design decisions to hand an agent.
- **Declared** — every declaration the page's own stylesheets make for this element, in cascade order, with the value **as authored**, then the inheritable ones from the nearest ancestor that sets them, in italic. Each row is editable (spec 13). There is no separate "propose a change" section and no invented rows: the panel reflects the source, and `+ property` adds an override where the source says nothing.
- **Accessibility** — name, role, keyboard-focusable.
- **What the agent will see** — the exact `styles` subset that goes into the payload, verbatim, read
  with the preview off so it is the code and not the proposal, and under it the pending changes as
  `from → to`. The two travel apart, which is what makes the diff meaningful (spec 13).

Declarations are written the way devtools writes them: mono on both sides, a swatch on every colour. The region is a scroll container, so it carries `tabindex="0"` — a scrollable
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
- A shadow reads the same whichever end its colour is written at: `0 1px 2px rgba(…)` as declared and
  `rgba(…) 0px 1px 2px 0px` as Chrome computes it normalise to one form — lengths, then colour, with
  a zero spread dropped.

`declaredTokens(doc, el?): Map<string, string>` is the other half: every custom property in scope,
keyed by **name**, in winning order, nothing dropped for sharing a value. `tokenMap`'s
one-name-per-value rule is right for reading a value back to its source and wrong for offering a
designer their own scale — a page where `--space-3` and `--text-xs` are both `12px` must still offer
both in the type editor (spec 13).

### Which name, when a value has several

`TOKEN_FAMILIES` maps a property to how a design system names its tokens: `/space|gap|pad/` for
padding, `/radius|rounded|corner/` for border-radius, `/leading|line/` for line-height. A name may
stand for a property when it is in that property's family, **or in no family at all** — `--brand`
says nothing about which property it is for, while `--space-2` says it is not a radius. A name from
another family is refused, and the value is reported without a token.

That rule is what makes an 8px border-radius resolve to `--radius-md` on a page where `--space-2` is
also 8px, and it is why a system named `--c1`, `--sp2` still resolves (those names are in no family)
while one that reuses `--space-2` for its corners does not.

`resolveDeclared(styles, declared, fontPx?)` applies it, and is what `describeElement` uses for the
payload and the overlay uses for its readings. `resolveTokens(styles, map, fontPx?)` is the lower
level, taking a value-keyed map and no family rule.

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

# 03 · Theming and design system

Owner: `packages/core/src/theme/` (math, tokens as data) and `packages/svelte/src/theme/` (CSS emission). The overlay is styled entirely from tokens produced here.

## The problem we are fixing

Both reference tools let you pick a "marker color" and then paint one or two things with it. Popups, hover outlines, status colors, panel chrome, light and dark variants are all hand-written constants, so a teal accent still gives you purple hovers and a gray panel that clashes with a warm host page. We want one input and a coherent whole.

## Inputs

```ts
export interface ThemeInput {
  accent: string;                 // any CSS color; default oklch(0.62 0.16 250)
  scheme: 'light' | 'dark' | 'auto';
  density?: 'compact' | 'comfortable';   // default comfortable
  radius?: number;                // px, default 10
  font?: string;                  // default system-ui stack
  overrides?: Partial<Record<TokenName, string>>;  // escape hatch, discouraged
}
```

The host can set the accent three ways, in this precedence: component prop `accent`, CSS custom property `--annot-accent` on `:root` of the host document, `accent-color` computed on `body`, else the default. `scheme: 'auto'` follows `prefers-color-scheme` and also the host's `color-scheme` on `:root` when it is explicitly `dark` or `light`.

## Color math (core, no deps)

Implement `parseColor(css): Oklch | null` (hex 3/4/6/8, `rgb()`, `hsl()`, `oklch()`, `oklab()`, the 148 named colors) and `toOklch(css): string`, `oklch(l, c, h, alpha?)`, `clampToGamut(oklch): Oklch` (reduce chroma until in sRGB), `contrast(a, b): number` (WCAG 2.x on sRGB). Tests against known pairs (`#ff0000` → `oklch(0.628 0.258 29.23)`, etc., tolerance 0.005).

## Derived palette

Everything comes from the accent's hue `H`, chroma `C` (clamped to `[0.04, 0.2]`), and the scheme.

Neutrals are *tinted*: hue `H`, chroma `0.008` (light) or `0.012` (dark), so a warm accent gives warm grays.

| Token | Light | Dark |
|-------|-------|------|
| `--annot-accent` | accent, clamped | accent, L raised to ≥ 0.72 |
| `--annot-accent-ink` | white or `oklch(0.2 0 0)` by contrast ≥ 4.5 | same rule |
| `--annot-accent-soft` | accent at L 0.94, C×0.35 | L 0.28, C×0.5 |
| `--annot-accent-line` | accent at L 0.72, C×0.8 | L 0.6 |
| `--annot-surface` | `oklch(0.99 0.008 H)` | `oklch(0.18 0.012 H)` |
| `--annot-surface-2` | L 0.96 | L 0.22 |
| `--annot-surface-3` | L 0.93 | L 0.27 |
| `--annot-ink` | `oklch(0.2 0.01 H)` | `oklch(0.95 0.008 H)` |
| `--annot-ink-2` | L 0.45 | L 0.72 |
| `--annot-ink-3` | L 0.62 | L 0.55 |
| `--annot-line` | L 0.88, C 0.012 | L 0.32 |
| `--annot-shadow` | `0 8px 24px oklch(0.2 0.02 H / 0.18)` | `0 8px 24px oklch(0 0 0 / 0.5)` |
| `--annot-scrim` | `oklch(0.2 0.02 H / 0.35)` | `oklch(0 0 0 / 0.55)` |

The **toolbar pill** is inverted relative to the scheme (dark pill on a light page, as in agentation; light pill on a dark page). Tokens `--annot-pill`, `--annot-pill-ink`, `--annot-pill-hover`, `--annot-pill-active` use the opposite scheme's surface/ink recipe. Popups and the panel use the same scheme as the page.

### Status and mode colors

Semantic hues are fixed but take L and C from the accent, so they read as one family:

| Status / mode | Hue | Notes |
|---------------|-----|-------|
| element mode highlight | `H` | the accent itself |
| text mode highlight | `H + 40` | a sibling hue, so text and element annotations can be told apart |
| page mode strokes default | `H - 40` | drawing palette offers `H`, `H±40`, `H+180`, and neutral ink |
| `draft` | `H`, dashed outline, C×0.6 | quiet |
| `sent` | `H`, solid | |
| `acknowledged` | `H`, solid, slow 2 s pulse on the marker | the agent is on it |
| `question` | 75 (amber) | needs the user |
| `review` | 150 (green), thin | calm, waiting for approve |
| `approved` | none | no highlight, panel row muted |
| `lost` anchor | neutral ink-3, dotted | |

For each: `--annot-<name>` (line/marker color, L 0.55 light / 0.75 dark), `--annot-<name>-fill` (highlight fill, alpha 0.18 light / 0.28 dark), `--annot-<name>-ink` (text on fill). Highlights on text use `fill` only; element outlines use `line` 2 px + `fill` at alpha 0.08.

All computed once per theme change and written as CSS custom properties on the overlay's shadow root host. Export `computeTheme(input, prefersDark): Record<TokenName, string>` and `themeToCss(tokens): string`.

## Type, spacing, shape

- Font: `--annot-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace` for selectors and quotes.
- Sizes: 11 / 12 / 13 / 15 px. Body 13. Selectors in mono 11.5.
- Spacing scale 4 8 12 16 24. `compact` density multiplies by 0.8.
- Radius: `--annot-radius` 10, pill 999, small controls 6, markers 999.
- Motion: 120 ms for hover, 200 ms `cubic-bezier(.2,.8,.2,1)` for panels/popups entering, exits 120 ms. Respect `prefers-reduced-motion`: no pulses, no slides.

## Visual language (borrowed from agentation, adapted)

- One floating pill bottom-right, 44 px tall, icon buttons 36 px, 1 px dividers between groups, tooltip above with label and shortcut in a smaller muted key cap. Draggable by its grip; position remembered per origin in localStorage.
- Popups are cards, `--annot-surface`, 1 px `--annot-line`, `--annot-shadow`, 12 px padding, max width 360, anchored to the target with an 8 px offset and flipped when out of viewport. First line is a breadcrumb in mono: `› button "Save"`.
- Markers are 22 px circles with the number, `--annot-<status>` background, `--annot-<status>-ink` text, 2 px `--annot-surface` ring; multi-select markers show a small stacked-squares glyph instead of the number when hovered.
- Panel is a right drawer, 360 px, same surface, header with route and counts, filter chips, list of rows with a 3 px left bar in the status color. Nothing bounces.
- Icons: a small inline SVG set drawn on a 20 px grid, 1.5 px stroke, round caps. Names: element, text, page (pen), brush, arrow, rect, ellipse, label, eraser, undo, redo, pause, play, eye, eye-off, send, inbox, check, check-all, reopen, chat, gear, grip, close, chevron. No icon library dependency.

## Deliverables

- `core/theme`: color math, `computeTheme`, `themeToCss`, token name union, with tests (contrast of every ink on its surface ≥ 4.5 in both schemes for six sample accents: teal, purple, orange, near-gray, very dark, very light).
- `svelte/src/theme`: `applyTheme(host: HTMLElement, input)` that reads the host document's hints and sets the properties on the shadow host; re-applies on `prefers-color-scheme` change and when the host's `--annot-accent` changes (poll on `animationframe` only while the overlay is active, or observe `style` attribute on `:root`).
- `docs/design/theme-sheet.html`: a static page that renders every token and every status/mode swatch for the six sample accents in both schemes. This is how we review the palette without running the app.

# @llm-ui-annotation/svelte

The annotation overlay: a Svelte 5 custom element `<annot-overlay>` with an open shadow root. It
draws highlights, pins, a popup and a review panel over any page without touching the host DOM,
and talks to `@llm-ui-annotation/vite-plugin` over `/__annot`.

## Mounting

Auto (what the Vite plugin does — it sets the globals, then imports this module):

```js
globalThis.__ANNOT_OPTIONS__ = { basePath: '/__annot', accent: '#2C8A85', scheme: 'auto' };
globalThis.__ANNOT_HOT__ = import.meta.hot;   // optional: push updates instead of polling
globalThis.__ANNOT_DOM_TO_CANVAS__ = domToCanvas;   // optional: page-mode screenshots
import('@llm-ui-annotation/svelte/auto');
```

By hand, from a host that would rather own the call:

```js
import { mount } from '@llm-ui-annotation/svelte';
const overlay = mount({ accent: '#2C8A85', sendMode: 'immediate', mode: 'text' });
```

Or as a component, in a dev-only branch of a Svelte app:

```svelte
{#if import.meta.env.DEV}
  <Annotator accent="#2C8A85" mode="text" sendMode="immediate" />
{/if}
```

## The element

`<annot-overlay>` reads `accent`, `scheme` (`light|dark|auto`), `density`, `route-key`, `send-mode`
(`batch|immediate`), `base-path` and `mode` (`element|text|page`); `accent`, `scheme`, `density` and
`send-mode` also apply when changed after mounting. Anything that cannot be an attribute — `hot`,
`doc`, `target` — goes through the `options` property before the element is connected, or through
`mount(options)`. `element.state` is the live `AnnotState`, which is what `tools/qa.mjs` drives.

## Modes

**Element** outlines what you point at and marquees a group; **Highlight** watches the host's own
selection, across block boundaries; **Draw** draws on an SVG layer inside a region you can resize,
and captures a screenshot on save when a capture backend is available. The `mode` attribute and
`PageTarget`/`TextTarget` keep their wire names `element`, `text`, `page`.

## Keyboard

The overlay sits on an app it does not own, so exactly one binding is global: **`⌥A`** opens the
command palette. It is rebindable in Settings and persisted in `annot:prefs`. Everything else needs
an active mode, or focus on one of our surfaces:

| Key | Does | Scope |
|-----|------|-------|
| `⌥A` | Command palette | always |
| `E` `H` `D` | Element / Highlight / Draw | in a mode |
| `⌘↵` | Add the annotation, or send the batch | in a mode |
| `I` | Toggle the panel | in a mode |
| `⇧P` | Pause animations | in a mode |
| `1`–`6` | Pick a drawing tool | in Draw |
| `⌘Z` `⇧⌘Z` | Undo / redo a stroke | in Draw |
| `⌫` | Delete the focused draft | in a mode |
| `⌘A` | Select every row the filter shows | in the panel |
| `Esc` | Exit the mode, close the popup or the panel | on a surface |
| `?` | Shortcut sheet | in a mode |

The palette lists modes, the drawing tools and colours while in Draw, panel filters, settings and
the annotations on this route (`#4`, or a word from the comment). It never offers Approve, Reopen,
Send or Approve all: those mutate the loop and belong where the target is visible.

## Panel

Every row acts while collapsed — `review` Approve, `question` Answer, `draft` Send, `approved`
Reopen — with a `⋯` menu for Edit, Delete, Reopen and Locate, and hovering a row outlines its target
on the page. A checkbox per row appears on hover: `⇧`-click extends, `⌘A` takes the whole filter,
and the footer turns into Approve / Reopen / Send / Delete with the count each transition allows,
enabled only when every selected row allows it.

## Design and isolation

Every colour, size, radius and duration comes from a token computed by
`@llm-ui-annotation/core/theme` and written onto the shadow root by `./theme`. The host page never
gains a class, an attribute or a wrapper: text highlights use the CSS Custom Highlight API through
one `<style data-annot-highlights>` in the host head, and everything else lives in the shadow root.
`scripts/no-host-mutation.mjs` runs in `lint` and `check` and fails on `classList`, `setAttribute`,
`innerHTML =` and friends anywhere in `src/`.

## Development

```sh
pnpm --filter @llm-ui-annotation/svelte dev          # dev page with a mock /__annot and a fake agent
node tools/qa.mjs --url http://127.0.0.1:5173/ --drive drive.js --shot /tmp/out.png
```

`dev/index.html` is a normal host page; `dev/hostile.html` resets every element with
`* { all: unset }`, declares `color-scheme: dark` and sets `--annot-accent` to prove the overlay
re-themes and stays isolated. The mock in `dev/mock.ts` answers the whole wire API in memory and
plays the agent: it acknowledges a batch, then declines comments starting with `decline:`, asks
about comments starting with `ask:`, and completes everything else.

## Known gaps

- **Screenshots** need a capture backend: install the optional peer `modern-screenshot` in the host
  app and the vite plugin hands `domToCanvas` to the overlay, or call `provideDomToCanvas` yourself.
  Without one, a page annotation is saved with its strokes and a "Saved without screenshot" toast.
  The overlay never imports the peer by a bare specifier: that would break the host's module graph
  when it is absent, and never resolve in the browser when it is present.
- **Blocking page interactions** while holding `⌘`/`Ctrl` swaps the capture layer for host-document
  listeners, so hover updates but the cursor does not change.
- **Pin visibility** has no key any more: `H` is Highlight mode. It lives in the pill and the palette.
- **Bulk undo** is offered for Approve only; Reopen, Send and Delete get a plain toast, because
  there is no reverse transition that would not lie about what happened.
- **Panel row flash**: clicking a row scrolls the target into view and opens its card; it does not
  pulse the highlight. Hovering outlines the target, which is most of what the flash was for.
- **`sendMode: 'immediate'`** creates one batch per annotation, as the spec asks, but there is no
  debounce, so three fast annotations are three batches.
- **Density** only scales the tokens; a few control heights are still derived with a multiplier
  rather than their own token.
- **Nothing type-checks `.svelte`**: `check` runs `tsc`, which skips them, so eleven components once
  imported `AnnotState` from a path that does not exist and nothing noticed. `svelte-check` would.

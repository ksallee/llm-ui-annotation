# @llm-ui-annotation/svelte

The annotation overlay: a Svelte 5 custom element `<annot-overlay>` with an open shadow root. It
draws highlights, markers, a popup and a review panel over any page without touching the host DOM,
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

`E` element, `T` text, `P` page, `Esc` to leave. `⌘↵` adds or sends, `I` the panel, `H` marker
visibility, `⇧P` pause animations, `⌘Z`/`⇧⌘Z` strokes, `?` the shortcut sheet. Element mode outlines
what you point at and marquees a group; text mode watches the host's own selection; page mode draws
on an SVG layer and captures a screenshot on save when a capture backend is available.

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
- **Panel row flash**: clicking a row scrolls the target into view and opens its card; it does not
  pulse the highlight.
- **`sendMode: 'immediate'`** creates one batch per annotation, as the spec asks, but there is no
  debounce, so three fast annotations are three batches.
- **Multi-block text selections** are refused with a chip rather than split into one annotation per
  block.
- **Density** only scales the tokens; a few control heights are still derived with a multiplier
  rather than their own token.
- **Nothing type-checks `.svelte`**: `check` runs `tsc`, which skips them, so eleven components once
  imported `AnnotState` from a path that does not exist and nothing noticed. `svelte-check` would.

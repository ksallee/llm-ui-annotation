# 07 · Reader app

Owner: `apps/reader`. Svelte 5 + Vite. Replaces the sit_hathor prototype with the shared packages. Not published to npm; run from the repo.

```
DOC=path/to/doc.md pnpm dev:reader
```

## Behaviour

- Renders one markdown file: title (`#`), optional italic epigraph before the first `##`, sections per `##`, an optional coda after a `---`. Use `marked` (the only extra dep) with GFM; every block gets `data-annot-block="<section>/<index>"` so selectors are stable across re-renders (core's ladder picks `[data-annot-id]`-style attributes first; register `data-annot-block` as a preferred attribute via the `describeElement` option `preferAttrs`).
- Left rail: title, section links, notes count, font size − / +, theme toggle. Right: the overlay's own panel replaces the prototype's notes panel; do not build a second one.
- The overlay is mounted manually with `mode` defaulting to `text`, `sendMode` defaulting to `immediate` (the prototype's "every note goes out") and `accent` set from the reader's `--accent`. Element and page modes stay available.
- Hot reload of the document: the Vite plugin for the reader (`apps/reader/vite-doc-plugin.ts`) watches `DOC` and pushes `doc` over the websocket, like the prototype. Annotations live in `<dirname(DOC)>/.annotations/` by passing `dir` to the shared plugin so notes sit next to the document, as before.
- `route` for the document is `/doc/<basename>`; multi-document sessions are out of scope.
- Design: keep the prototype's calm reading look (Literata/Fraunces or system serif fallbacks, 66ch measure, warm tinted neutrals from the theme math with the accent). The overlay tokens derive from the same accent so highlights match.

## What is dropped from the prototype

The custom `mark` wrapping, the notes json/log format, the `handled/done` vocabulary (mapped to `review/approved`), the French UI strings in shared code (the reader's own rail may stay French if the user wants; default English).

## Migration helper

`apps/reader/scripts/migrate-notes.mjs <doc.md>` converts `<doc>.notes.json` to `.annotations/routes/doc__<slug>.json`: `pi/start/end/quote/section` → a `TextTarget` with `container.selector = [data-annot-block="<section>/<pi>"]`, `status` open→sent, handled→review with summary "migrated", done→approved. One run, prints counts.

## Acceptance criteria

- Playwright: open the reader on a fixture markdown, select text inside a paragraph, annotate, assert the route file has a `TextTarget` with a `[data-annot-block]` selector and the highlight is drawn; edit the markdown file on disk (insert a paragraph before the quote), assert the highlight is re-anchored with state `moved`, then `exact` once the CLI marks it done and the user approves it disappears.
- Migration script test on the sit_hathor fixture (`apps/reader/test/fixtures/sit-hathor.notes.json`, anonymized).

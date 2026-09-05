# reader

A markdown reader that mounts the annotation overlay in text mode: one document, a left rail, and
the overlay's own panel on the right. It is the sit_hathor prototype rebuilt on the shared packages
— notes are anchored by quote and offsets, never by wrapping the text in `<mark>`.

## Run

```sh
pnpm build                                   # the overlay resolves to packages/svelte/dist
DOC=path/to/doc.md pnpm dev:reader           # defaults to apps/reader/docs/sample.md
```

Annotations land in `<dirname(DOC)>/.annotations/`, so notes sit next to the document; `ANNOT_DIR`
overrides that. The route is `/doc/<basename>`, and the agent picks the batch up with `annot watch`
from the repo root with the same `ANNOT_DIR`.

## How it works

`vite-doc-plugin.ts` serves the document at `/__doc`, injects its metadata into the page, and pushes
`annot-reader:doc` over Vite's HMR socket whenever the file changes; the page re-renders and the
overlay re-anchors on its own. `render.ts` turns the markdown into a title, an optional epigraph,
one region per `##` and an optional coda after a `---`, stamping `data-annot-block="<section>/<n>"`
on every block so core's selector ladder has something stable to grab. Every colour comes from
`computeTheme` on the one accent in `src/theme.ts`, written onto `:root`, which is also where the
overlay reads its scheme hint.

## Migrating the prototype's notes

```sh
node apps/reader/scripts/migrate-notes.mjs path/to/doc.md [--force]
```

Reads `<doc>.notes.json`, writes `<dirname(doc)>/.annotations/routes/<slug>.json` and prints the
counts. `pi/start/end/quote/section` becomes a `TextTarget` on `[data-annot-block="<section>/<pi>"]`;
`open → sent`, `handled → review` (summary `migrated` unless the note carried one), `done →
approved`. Any other status is skipped. The fixture in `test/fixtures/sit-hathor.notes.json` is
synthetic — the original document is not in this repo.

## Test

```sh
pnpm --filter reader test
```

`render.test.ts` covers the block numbering, `migrate-notes.test.ts` the migration, and
`reader.e2e.test.ts` drives Playwright's chromium against a real reader dev server: annotate a
selection, edit the document on disk and watch the anchor go `moved` then `exact` again, then
`annot done` and approve. The suite runs under vitest so `pnpm test` at the root covers it.

## Known gaps

See `docs/known-gaps.md` for the consolidated list. The reader's own:

- The rail is English only; the prototype's French copy did not move over.
- Multi-document sessions are out of scope: one `DOC` per dev server.
- Draw mode saves strokes without a screenshot: the reader does not install the optional
  `modern-screenshot` peer.

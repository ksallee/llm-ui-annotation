# @llm-ui-annotation/core

The vocabulary every other package shares: annotation types, ids, the status state machine, hand-written
validation, the `.annotations/` file protocol, and the markdown the agent reads. Zero runtime dependencies,
never touches `window` at import time. Spec: `docs/specs/01-data-model-and-protocol.md`.

## Four entries

`@llm-ui-annotation/core` is framework-free and safe in a browser bundle.
`@llm-ui-annotation/core/dom` adds the algorithms that read a live page: selector generation, element
description, text anchoring, stroke rendering, region capture and animation freezing. Every function takes a
`Document`, `Element` or `Range`, so it runs under happy-dom as readily as in a browser.
`@llm-ui-annotation/core/node` adds the `node:fs` helpers that read and write `.annotations/`.
`@llm-ui-annotation/core/theme` is the oklch color math and the palette every overlay token comes from.
Importing one never pulls in the others.

```ts
import { applyTransition, newId, renderBatchMarkdown, slug, validateAnnotation } from '@llm-ui-annotation/core';
import { anchorText, describeElement } from '@llm-ui-annotation/core/dom';
import { appendEvent, readRoute, writeRoute } from '@llm-ui-annotation/core/node';

const acknowledged = applyTransition(annotation, 'acknowledged', 'agent');
const ref = describeElement(event.target as Element);
const anchor = anchorText(document, annotation.target as TextTarget);
const file = await readRoute('.annotations', '/pricing');
await appendEvent('.annotations', { at: acknowledged.updatedAt, type: 'status.changed', by: 'agent', route: '/pricing' });
```

```ts
import { computeTheme, themeToCss, toOklch } from '@llm-ui-annotation/core/theme';

const tokens = computeTheme({ accent: '#0d9488', scheme: 'auto' }, prefersDark);
const css = themeToCss(tokens);
```

One accent in, 88 tokens out: surfaces, inks, the inverted toolbar pill, a color per status and mode,
type, spacing, shape and motion. Every ink clears WCAG 4.5 on its surface in both schemes; the test that
proves it runs over six sample accents, and `docs/design/theme-sheet.html` shows the result.

## Conventions this package sets for the workspace

ESLint 9 flat config and every shared devDependency live at the repo root, so a package declares only its own
runtime deps and no lockfile churn when eight agents work in parallel.
Each package ships `tsconfig.json` (typechecks `src` + `test`, `noEmit`) and `tsconfig.build.json` (emits
`dist` with declarations), an `exports` map pointing at `dist`, and the four scripts `build` / `check` / `lint` / `test`.
`check` builds first so downstream packages typecheck against fresh declarations; relative imports carry a `.js`
extension so the emitted ESM runs under Node.

## Known gaps

See `docs/known-gaps.md`.

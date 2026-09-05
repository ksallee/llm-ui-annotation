# @llm-ui-annotation/core

The vocabulary every other package shares: annotation types, ids, the status state machine, hand-written
validation, the `.annotations/` file protocol, and the markdown the agent reads. Zero runtime dependencies,
never touches `window` at import time. Spec: `docs/specs/01-data-model-and-protocol.md`.

## Two entries

`@llm-ui-annotation/core` is framework-free and safe in a browser bundle.
`@llm-ui-annotation/core/node` adds the `node:fs` helpers that read and write `.annotations/`.
Importing the first never pulls in the second.

```ts
import { applyTransition, newId, renderBatchMarkdown, slug, validateAnnotation } from '@llm-ui-annotation/core';
import { appendEvent, readRoute, writeRoute } from '@llm-ui-annotation/core/node';

const acknowledged = applyTransition(annotation, 'acknowledged', 'agent');
const file = await readRoute('.annotations', '/pricing');
await appendEvent('.annotations', { at: acknowledged.updatedAt, type: 'status.changed', by: 'agent', route: '/pricing' });
```

## Conventions this package sets for the workspace

ESLint 9 flat config and every shared devDependency live at the repo root, so a package declares only its own
runtime deps and no lockfile churn when eight agents work in parallel.
Each package ships `tsconfig.json` (typechecks `src` + `test`, `noEmit`) and `tsconfig.build.json` (emits
`dist` with declarations), an `exports` map pointing at `dist`, and the four scripts `build` / `check` / `lint` / `test`.
`check` builds first so downstream packages typecheck against fresh declarations; relative imports carry a `.js`
extension so the emitted ESM runs under Node.

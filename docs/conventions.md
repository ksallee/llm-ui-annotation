# Workspace conventions

Set by WS 01 in `packages/core`. Copy them; do not re-invent them per package.

## Package layout

- Two tsconfigs. `tsconfig.json` extends `../../tsconfig.base.json`, `noEmit`, `include: ["src", "test", "vitest.config.ts"]`. `tsconfig.build.json` extends it with `rootDir: src`, `outDir: dist`, `declaration`, `declarationMap`.
- Scripts: `build: tsc -p tsconfig.build.json` · `check: pnpm run build && tsc -p tsconfig.json --noEmit` · `lint: eslint .` · `test: vitest run` · `clean`. `check` builds first because `pnpm -r` is topological and downstream packages need your declarations.
- `package.json`: `type: module`, `sideEffects: false`, `private: true`, `files: ["dist", "README.md"]`. Exports map `{ ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }, "./sub": { … }, "./package.json": "./package.json" }`.
- Relative imports carry `.js` (`./id.js`). Required for the emitted ESM to run in Node.
- `vitest.config.ts`: `{ test: { environment: 'node', include: ['test/**/*.test.ts'] } }`. Use `environment: 'happy-dom'` where you need DOM.

## Dependencies

- ESLint 9 flat config, one `eslint.config.js` at the repo root. No per-package config.
- Shared devDeps live at the root only: eslint, typescript-eslint, typescript, vitest, happy-dom, @types/node, globals. Declare only your own **runtime** deps in your package, so the lockfile barely moves.

## Protocol decisions downstream code must honour

- `applyTransition` has no resolution parameter. The resolution is derived from the message kind: `summary` → `{ kind: 'changed' }`, `decline` → `{ kind: 'declined' }`, the text becomes the summary. An HTTP `resolution` body field maps onto such a message.
- Reopen sets `batch: null`. Whoever creates the new batch calls `assignBatch(a, batchId)`.
- `sentAt` is stamped on any move into `sent` except `sent → sent` (editing while sent).
- `slug` budgets 120 chars total: 111 + `-` + 8 hex FNV-1a. `/pricing` → `__pricing`, `/` → `index`.
- `newId` is strictly monotonic within a millisecond.
- Atomic writes use `<file>.<pid>.<n>.tmp` so two writers cannot collide.
- Errors on the wire are `{ error, problems? }`; the request and response shapes are exported types in `@llm-ui-annotation/core`.

## Shared files

`packages/core/src/index.ts`, `packages/core/package.json` and the root `package.json` are touched by more than one workstream. On a merge conflict there, take **both** sides — these are additive barrels and exports maps, never a real conflict. On a `pnpm-lock.yaml` conflict take `dev`'s side and re-run `pnpm install`.

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

## Code style

Declarative. The reader is as often an agent as a person, so the code has to be legible cold.

- **File header.** One line at the top of a file saying what the file is, when the filename does not
  already say it. Not a changelog, not an inventory of its exports.
- **Comments.** Only where the code is genuinely hard to follow, and only for what the code cannot
  state itself — a constraint from the DOM, a browser behaviour, a decision that looks wrong until
  you know the reason. Never code history, never session or PR context, never a restatement of the
  line below.
- **Doc comments.** What the function does, never why it was built. One short sentence. A genuinely
  non-obvious function may take two or three; most take one and stop. No examples, no rationale.
- **Params.** Typed, and at most one very short sentence each. Usually none: a well-named param
  documents itself.
- **Classes and modules.** A class earns its place by owning state with invariants. Anything else is
  a function, and a module that exists only because something had to go somewhere is a module that
  should be deleted. The same for a component with one user.
- **Duplication.** Collapse it when the second copy appears, not before. An abstraction with a
  single caller costs more than the duplication it removed.

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

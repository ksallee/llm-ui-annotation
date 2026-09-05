# Launching the workstreams

Each workstream gets one agent in its own worktree. Paste the prompt below into a fresh Claude Code session started from a worktree of this repo (`git worktree add ../llm-ui-annotation-ws04 -b ws04-svelte-overlay main`). Phase 1 first, alone. Then phase 2 in parallel. Then phase 3.

## Common prompt prefix

```
You are implementing one workstream of llm-ui-annotation. Read CLAUDE.md, docs/specs/00-overview.md, docs/decisions.md, then your spec below in full before writing code. Stay inside the directories your spec owns. Code against the types in packages/core when they exist; when they do not yet, define local stubs that match spec 01 exactly and mark them TODO(ws-01). Work until every acceptance criterion in your spec passes, run pnpm check/lint/test at the root, then commit in small grouped commits with one-line messages and merge your branch into main (fast-forward or merge commit, never force). If the spec is wrong or impossible, change the spec in the same commit and say why in one sentence. Do not ask me questions unless you are truly blocked; make the call, note it in the PR description, and continue.
```

## Phase 1 (sequential)

**WS 01 · Data model and protocol** — `docs/specs/01-data-model-and-protocol.md`. Scaffold `packages/core` (package.json, tsconfig extending the base, vitest). Deliver types, ids, slugs, state machine, validation, event helpers, `readRoute/writeRoute/appendEvent` node helpers in a separate entry `@llm-ui-annotation/core/node`, and `renderBatchMarkdown`. Freeze the spec when done.

## Phase 2 (parallel, after WS 01 is on main)

**WS 02 · Core algorithms** — `docs/specs/02-core-algorithms.md`. Owns `packages/core/src/dom/`.

**WS 03 · Theming and design** — `docs/specs/03-theming-and-design.md`. Owns `packages/core/src/theme/`, `packages/svelte/src/theme/`, `docs/design/theme-sheet.html`. Coordinate with WS 04 only through the token names listed in the spec.

**WS 04 · Svelte overlay** — `docs/specs/04-svelte-overlay.md`. Owns `packages/svelte`. Largest workstream; start with the state class, layers, element mode and popup; then text, page, panel, settings. Use local stubs for 02 and 03 until they merge, then swap.

**WS 05 · Vite plugin** — `docs/specs/05-vite-plugin.md`. Owns `packages/vite-plugin`.

**WS 06 · CLI** — `docs/specs/06-cli-and-agent-contract.md`. Owns `packages/cli`. Test the HTTP path against WS 05 once it lands; the file path works before that.

## Phase 3 (after 04 and 05 are on main)

**WS 07 · Reader app** — `docs/specs/07-reader-app.md`. Owns `apps/reader`.

**WS 08 · Demo and e2e** — `docs/specs/08-demo-app-and-e2e.md`. Owns `apps/demo`, `.github/workflows/ci.yml`. This one will find integration bugs in 02–06; fix them in place when small, otherwise open a short issue in the spec's package README under "Known gaps" and keep going.

## After phase 3

Integration review pass by one agent: run every e2e, read every package README, reconcile specs with reality, cut `0.1.0` tags for the four packages (not published). Then we decide on names for npm and the public repo rules.

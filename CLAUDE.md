# llm-ui-annotation

Annotate a running UI in the browser (click elements, select text, draw on the page), send the batch to a coding agent, watch it get fixed, approve. Svelte 5 first. No MCP: the protocol is files in `.annotations/` plus a small CLI the agent runs.

Read `docs/specs/00-overview.md` before touching anything. The specs are the source of truth; if code and spec disagree, fix one and say which.

## Layout

```
packages/core         framework-free: types, protocol, selectors, text anchoring, theming math
packages/svelte       the overlay UI (Svelte 5, runes, custom element with shadow DOM)
packages/vite-plugin  dev-server side: storage in .annotations/, websocket push, auto-inject, screenshots
packages/cli          `annot` binary the agent uses: watch / pending / ack / ask / done / decline / reply
apps/reader           markdown reader with text annotations (the original sit_hathor use case)
apps/demo             Svelte playground + Playwright e2e
docs/specs            one spec per workstream, numbered in dependency order
docs/research         what we learned from agentation, agent-ui-annotation, and the reader prototype
```

## Rules

- pnpm workspaces, Node 22+, TypeScript strict, ESM only. Svelte 5 runes, no legacy `$:` syntax, no stores unless a spec asks.
- `packages/core` has zero runtime dependencies and never touches `window` at import time. Everything DOM-related is a function that takes a `Document`/`Element` argument so it is testable in happy-dom.
- Never mutate the host page's DOM to show state. Highlights, outlines, markers and drawings live in the overlay layer (shadow DOM host) or use the CSS Custom Highlight API. Wrapping host text in `<mark>` breaks Svelte's DOM reconciliation in the host app.
- Every color in the UI derives from one accent via oklch. No hard-coded hex in components. See `docs/specs/03-theming-and-design.md`.
- Annotation ids are `ulid`-style sortable strings generated client-side. Timestamps are ISO 8601 UTC.
- The file protocol in `docs/specs/01-data-model-and-protocol.md` is frozen once phase 1 merges. Changing it requires a spec change in the same PR and a version bump of `protocolVersion`.
- Tests: vitest for core and cli (happy-dom where DOM is needed), Playwright for `apps/demo`. A workstream is not done until its acceptance criteria in the spec pass.
- UI strings in English. Keep the reader's French copy out of the shared packages.

## Looking at the UI

Use `tools/qa.mjs`, never a browser MCP. An MCP returns an accessibility snapshot and a console log
on every call, which is most of what a UI session costs; this is a CLI that runs headless, writes to
disk, and returns only your drive script's own value as JSON.

```sh
node tools/qa.mjs --app apps/demo --drive drive.js --shot /tmp/out.png   # isolated dev server
node tools/qa.mjs --url http://127.0.0.1:5173/ --drive -                 # server you already have
```

`--app` starts the app on a free port with its own `ANNOT_DIR`, so two worktrees never share
`.annotations/`. The drive script is the body of an async function with `sh`/`shAll` (the overlay's
shadow root), `$`/`$$` (the host document), `click`, `type`, `text`, `wait`. Read the header of
`tools/qa.mjs` before writing one. Screenshots go to a file you open when you need it — not into the
transcript.

## Git

- Work on a branch per workstream, one worktree per agent. `dev` is the integration branch: land your
  work there, never on `main`. `main` is checked out in the orchestrator's worktree and is reviewed in
  one pass at the end. While the repo is private there is no PR review; when we go public this changes,
  so do not build habits that depend on direct pushes.
- Publish from your worktree with `git push /Users/salleek/dev/llm-ui-annotation HEAD:dev`. Rejected as
  non-fast-forward means someone landed first: `git merge dev`, re-run the gates, push again. On a
  `pnpm-lock.yaml` conflict take `dev`'s side and re-run `pnpm install`.
- Commits and PRs: short, to the point, grouped. One-line title, two to five bullet body at most. No essays.
- Do not commit `.annotations/`, screenshots from test runs, or `node_modules`.
- Never force-push `main`.

## Agents working here

You are probably one of several agents working in parallel worktrees. Stay inside the directories your spec owns. If you need something from another package that does not exist yet, code against the types in `packages/core` and the spec, stub locally, and leave a `TODO(ws-XX)` naming the workstream you are waiting on.

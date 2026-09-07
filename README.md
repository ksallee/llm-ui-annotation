# llm-ui-annotation

Annotate a running UI in the browser and hand the feedback to a coding agent. Point at an element, select a run of text, or draw on the page; say what should change; send. The agent picks it up from files in your project, does the work, answers questions in a thread, and marks each item for review. You approve, the highlight disappears.

- Svelte 5 first, framework-free core.
- No MCP, no cloud: a Vite plugin writes `.annotations/`, a small `annot` CLI is what the agent runs.
- One accent in, a coherent light and dark palette out (oklch). Highlights, pins, popups and panel all follow it.
- Never mutates your app's DOM.

Status: `0.1.0`, sixteen workstreams landed, not published to npm. 506 unit tests pass. The 50
Playwright e2e pass individually but the suite is not reliably green end to end — about one run in
three trips over the duplicate-attachment bug in `docs/known-gaps.md`. The four packages in `packages/` are private workspace packages; run the demo from
the repo.

```sh
pnpm install && pnpm build
pnpm dev:demo      # the playground, overlay auto-injected
pnpm dev:reader    # the markdown reader
```

See `docs/specs/00-overview.md` for the architecture, `docs/known-gaps.md` for what does not work
yet, `docs/decisions.md` and `docs/launch.md` for how it was built.

MIT.

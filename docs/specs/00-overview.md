# 00 · Overview and workstreams

## What we are building

A dev-time overlay for web UIs. You switch it on, point at things (an element or a run of text), say what should change, and send. A coding agent running in the same repo picks the batch up, does the work, replies or asks, and marks each item for review. You approve, the highlight disappears. Everything is files in the project plus a small CLI. No MCP, no cloud.

Primary host: a Svelte 5 app running under Vite. Secondary host: a markdown document in the bundled reader app.

## Architecture in one picture

```
 browser (host app in dev)                       project directory                    agent (Claude Code)
 ┌──────────────────────────────┐                ┌──────────────────────────┐          ┌──────────────────────┐
 │ host DOM (never mutated)     │                │ .annotations/            │          │ $ annot watch        │
 │                              │  HTTP  ┌─────┐ │   routes/<slug>.json    │  read    │   (blocks, exits     │
 │ <annot-overlay> shadow DOM   │───────▶│vite │─┼─▶ events.jsonl          │─────────▶│    when batch lands) │
 │  toolbar · modes · popup     │◀───────│plug-│ │   attachments/<id>/     │          │ $ annot ack/ask/done │
 │  markers · panel · threads   │  ws    │ in  │◀┼── server.json (port)    │◀─────────│   (HTTP if server up,│
 └──────────────────────────────┘        └─────┘ └──────────────────────────┘  write   │    else writes files)│
                                                                                       └──────────────────────┘
```

- `packages/core` owns the vocabulary: types, the file protocol, selector generation, text anchoring, element description, theming math. Pure functions, no runtime deps.
- `packages/svelte` is the overlay. One custom element, shadow DOM, Svelte 5 runes. Talks to the plugin over `fetch` and Vite's websocket.
- `packages/vite-plugin` is the single writer of `.annotations/` while the dev server runs. Serves the HTTP API, pushes changes over the websocket, injects the overlay in dev, stores attachments.
- `packages/cli` is what the agent runs. `annot watch` is the wake-up call; the rest are verbs that move an annotation through its lifecycle.
- `apps/reader` renders a markdown file and mounts the overlay in text mode. `apps/demo` is a Svelte playground with every kind of element, used for manual testing and Playwright e2e.

## Lifecycle (the one thing everyone must agree on)

```
  user                            agent                             user
  ────                            ─────                             ────
  draft ──send──▶ sent ──┬──ack──────▶ acknowledged ──┬──done/decline──▶ review ──approve──▶ approved
                         ├──ask──────▶ question ──────┘  (answer)                │              │
                         └──done/decline────────────────────────────────────────▶│              │
                                                                                 │              │
                            sent ◀──────────────── reopen, in a new batch ───────┴──────────────┘
```

Read it as the table in spec 01, which is the same thing without the ASCII:

| from | the agent may move it to | the user may move it to |
|------|--------------------------|--------------------------|
| `draft` | — | `sent` (or delete it) |
| `sent` | `acknowledged`, `question`, `review` | `sent` — edit the comment, appends a `comment` message |
| `acknowledged` | `question`, `review` | — |
| `question` | — | `acknowledged` — answer |
| `review` | — | `approved`, or `sent` — reopen |
| `approved` | — | `sent` — reopen from history |

The agent may skip `acknowledged` and take a `sent` item straight to `question` or `review`. A reopen
clears the resolution and gets a new batch. Highlights are visible for every status except
`approved`. `review` items get the calm treatment (thin outline, agent summary on hover, inline
Approve). `TRANSITIONS` in `packages/core/src/model/transitions.ts` is the executable copy; spec 04
says how each status looks.

## Workstreams

Ten workstreams, all landed. WS 09 and WS 10 share spec 09: it was written after the first hands-on
session with the overlay and split into two agents, so it supersedes the conflicting parts of specs
03 and 04.

| WS | Spec | Package | Depends on | Size |
|----|------|---------|------------|------|
| 01 | Data model and protocol | `packages/core` (types, schema, protocol helpers) | none | S, do first, freezes the contract |
| 02 | Core algorithms | `packages/core` (selectors, text anchoring, element info) | 01 types | M |
| 03 | Theming and design system | `packages/core/theme` + `packages/svelte/src/theme` | 01 | S |
| 04 | Svelte overlay | `packages/svelte` | 01, 02, 03 (can start on 01 with stubs) | L |
| 05 | Vite plugin | `packages/vite-plugin` | 01 | M |
| 06 | CLI and agent contract | `packages/cli` | 01, 05 (HTTP API shape) | M |
| 07 | Reader app | `apps/reader` | 04, 05 | S |
| 08 | Demo app and e2e | `apps/demo` | 04, 05, 06 | M |
| 09 | Multi-block text, protocol 2 (spec 09 §5) | `packages/core` model + `src/dom/text.ts` | 02, 04 | S, bumps `protocolVersion` to 2 |
| 10 | Interaction rework (spec 09 §1–4, §6–10) | `packages/svelte` | 04, 08 | M |
| 13 | Style edits, protocol 3 | `packages/svelte` (editors, preview) + `packages/core` model | 04, 12 | M, bumps `protocolVersion` to 3 |

Phase 1: WS 01 alone, one agent, merge to `main`. Everything downstream imports its types.
Phase 2: WS 02, 03, 04, 05, 06 in parallel worktrees. 04 starts against 01 and stubs 02/03 locally where needed.
Phase 3: WS 07 and 08 once 04 and 05 are on `main`. 08 runs the full loop end to end with a scripted fake agent.
Phase 4: WS 09 and 10, after the first hands-on session found what only using the thing could find.
Phase 5: one integration agent reconciles the specs with the code, consolidates `docs/known-gaps.md` and cuts `0.1.0`.

Ownership is by directory. A workstream may add to `packages/core` only in the subdirectory the spec names.

## Non-goals for v1

Bookmarklet or browser extension, production builds (the overlay is dev-only), mobile, collaborative multi-user sessions, framework component detection, layout/wireframe mode, i18n, MCP.

## Definition of done, per workstream

1. Acceptance criteria in the spec pass, with tests where the spec asks.
2. `pnpm check`, `pnpm lint`, `pnpm test` green at the workspace root.
3. A short README in the package: what it is, how to use it, three lines each.
4. Spec updated if reality diverged, in the same PR, with one line saying why.

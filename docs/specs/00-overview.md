# 00 · Overview and workstreams

## What we are building

A dev-time overlay for web UIs. You switch it on, point at things (an element, a run of text, or anything you can draw around), say what should change, and send. A coding agent running in the same repo picks the batch up, does the work, replies or asks, and marks each item for review. You approve, the highlight disappears. Everything is files in the project plus a small CLI. No MCP, no cloud.

Primary host: a Svelte 5 app running under Vite. Secondary host: a markdown document in the bundled reader app.

## Architecture in one picture

```
 browser (host app in dev)                       project directory                    agent (Claude Code)
 ┌──────────────────────────────┐                ┌──────────────────────────┐          ┌──────────────────────┐
 │ host DOM (never mutated)     │                │ .annotations/            │          │ $ annot watch        │
 │                              │  HTTP  ┌─────┐ │   routes/<slug>.json    │  read    │   (blocks, exits     │
 │ <annot-overlay> shadow DOM   │───────▶│vite │─┼─▶ events.jsonl          │─────────▶│    when batch lands) │
 │  toolbar · modes · popup     │◀───────│plug-│ │   screenshots/<id>.png  │          │ $ annot ack/ask/done │
 │  markers · panel · threads   │  ws    │ in  │◀┼── server.json (port)    │◀─────────│   (HTTP if server up,│
 └──────────────────────────────┘        └─────┘ └──────────────────────────┘  write   │    else writes files)│
                                                                                       └──────────────────────┘
```

- `packages/core` owns the vocabulary: types, the file protocol, selector generation, text anchoring, element description, theming math. Pure functions, no runtime deps.
- `packages/svelte` is the overlay. One custom element, shadow DOM, Svelte 5 runes. Talks to the plugin over `fetch` and Vite's websocket.
- `packages/vite-plugin` is the single writer of `.annotations/` while the dev server runs. Serves the HTTP API, pushes changes over the websocket, injects the overlay in dev, saves screenshots.
- `packages/cli` is what the agent runs. `annot watch` is the wake-up call; the rest are verbs that move an annotation through its lifecycle.
- `apps/reader` renders a markdown file and mounts the overlay in text mode. `apps/demo` is a Svelte playground with every kind of element, used for manual testing and Playwright e2e.

## Lifecycle (the one thing everyone must agree on)

```
draft ──send──▶ sent ──agent ack──▶ acknowledged ──agent done/decline──▶ review ──user approve──▶ approved
                 ▲                      │                                   │
                 │                      └──agent ask──▶ question ──user answer──┘ (back to acknowledged)
                 └──────────────────────────────────── user reopen ◀────────┘
```

Highlights are visible for every status except `approved`. `review` items get the calm treatment (thin outline, agent summary on hover, inline Approve). See spec 01 for the exact state machine and spec 04 for how each status looks.

## Workstreams

| WS | Spec | Package | Depends on | Size |
|----|------|---------|------------|------|
| 01 | Data model and protocol | `packages/core` (types, schema, protocol helpers) | none | S, do first, freezes the contract |
| 02 | Core algorithms | `packages/core` (selectors, text anchoring, element info, screenshot helpers) | 01 types | M |
| 03 | Theming and design system | `packages/core/theme` + `packages/svelte/src/theme` | 01 | S |
| 04 | Svelte overlay | `packages/svelte` | 01, 02, 03 (can start on 01 with stubs) | L |
| 05 | Vite plugin | `packages/vite-plugin` | 01 | M |
| 06 | CLI and agent contract | `packages/cli` | 01, 05 (HTTP API shape) | M |
| 07 | Reader app | `apps/reader` | 04, 05 | S |
| 08 | Demo app and e2e | `apps/demo` | 04, 05, 06 | M |

Phase 1: WS 01 alone, one agent, merge to `main`. Everything downstream imports its types.
Phase 2: WS 02, 03, 04, 05, 06 in parallel worktrees. 04 starts against 01 and stubs 02/03 locally where needed.
Phase 3: WS 07 and 08 once 04 and 05 are on `main`. 08 runs the full loop end to end with a scripted fake agent.

Ownership is by directory. A workstream may add to `packages/core` only in the subdirectory the spec names.

## Non-goals for v1

Bookmarklet or browser extension, production builds (the overlay is dev-only), mobile, collaborative multi-user sessions, framework component detection, layout/wireframe mode, i18n, MCP.

## Definition of done, per workstream

1. Acceptance criteria in the spec pass, with tests where the spec asks.
2. `pnpm check`, `pnpm lint`, `pnpm test` green at the workspace root.
3. A short README in the package: what it is, how to use it, three lines each.
4. Spec updated if reality diverged, in the same PR, with one line saying why.

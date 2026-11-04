# Decisions

Recorded 2026-09-05 from the kickoff decision tree. Change a decision here first, then in the specs.

| # | Question | Decision | Why |
|---|----------|----------|-----|
| 1 | Fork or greenfield | Greenfield, Svelte-first, framework-free core | Existing tool's architecture and theming are the problem; Svelte is the main target |
| 2 | Agent transport | Vite plugin writes `.annotations/`, CLI `annot watch` blocks until a batch, agent flips status through the CLI | Proven by the reader prototype, no MCP, no extra process |
| 3 | Where the overlay runs | Inside a Svelte app in dev (auto-inject) and over markdown docs (reader app) | Bookmarklet/any-URL deferred, it needs the standalone server |
| 4 | Lifecycle | Full threads: agent can ask, user answers in place, agent resumes | "Acted upon unless there are questions" |
| 5 | Text anchor | Container selector + quote + offsets + prefix/suffix, fuzzy ladder, `moved` flag | Generalizes the reader's scheme, aligns with W3C selectors |
| 6 | Element payload | Stable selector, name, text, bbox, computed-style subset, parent/sibling context | Svelte component + file:line deferred to v2 |
| 7 | Theming | One accent, derived palette in oklch, light/dark/auto | Fix the "accent doesn't apply" flaw at the root |
| 8 | Send | User setting: batch (drafts + Send button with optional summary) or immediate | Both workflows are real |
| 9 | Review | Per-item Approve/Reopen in panel, Approve-all in panel, hover on pending highlight shows agent summary + inline approve | Approved items lose their highlight |
| 10 | Storage | `.annotations/` at project root, one json per route, `events.jsonl`, `attachments/`, gitignored | Working files, not deliverables |
| 11 | Repo | `ksallee/llm-ui-annotation`, MIT, private for now | |
| 12 | Layout | pnpm monorepo: core, svelte, vite-plugin, cli, apps/reader, apps/demo | One package per agent |
| 13 | Briefs | `docs/specs/*.md`, agents in parallel worktrees, repo `CLAUDE.md` | No GitHub issues for now |
| 14 | Merging | Straight to `main` while private; PR review once public | |

Deferred, not rejected: bookmarklet/standalone server, Svelte component and source location in payload, layout/placement mode (agentation), i18n, Claude Code hooks for hands-free wake-up.

## Changed since

- 2026-11-04 · Draw mode dropped: no freehand drawing, strokes or region screenshots. The overlay has two
  modes, Element and Highlight. Decided with Jeremy, issue #1.

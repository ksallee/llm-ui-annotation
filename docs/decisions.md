# Decisions

Recorded 2026-09-05 from the kickoff decision tree. Change a decision here first, then in the specs.

| # | Question | Decision | Why |
|---|----------|----------|-----|
| 1 | Fork or greenfield | Greenfield, Svelte-first, framework-free core | Existing tool's architecture and theming are the problem; Svelte is the main target |
| 2 | Agent transport | Vite plugin writes `.annotations/`, CLI `annot watch` blocks until a batch, agent flips status through the CLI | Proven by the reader prototype, no MCP, no extra process |
| 3 | Where the overlay runs | Inside a Svelte app in dev (auto-inject) and over markdown docs (reader app) | Bookmarklet/any-URL deferred, it needs the standalone server |
| 4 | Lifecycle | Full threads: agent can ask, user answers in place, agent resumes | "Acted upon unless there are questions" |
| 5 | Page mode tools | Brush, arrow, rectangle/ellipse, text label, color, stroke width, undo/redo, eraser | Numbered pins deferred |
| 6 | Drawing payload | Screenshot with overlay burned in + intersecting elements + note; vectors stored too | Claude reads images; selectors make it grep-able |
| 7 | Text anchor | Container selector + quote + offsets + prefix/suffix, fuzzy ladder, `moved` flag | Generalizes the reader's scheme, aligns with W3C selectors |
| 8 | Element payload | Stable selector, name, text, bbox, computed-style subset, parent/sibling context | Svelte component + file:line deferred to v2 |
| 9 | Theming | One accent, derived palette in oklch, light/dark/auto | Fix the "accent doesn't apply" flaw at the root |
| 10 | Send | User setting: batch (drafts + Send button with optional summary) or immediate | Both workflows are real |
| 11 | Review | Per-item Approve/Reopen in panel, Approve-all in panel, hover on pending highlight shows agent summary + inline approve | Approved items lose their highlight |
| 12 | Storage | `.annotations/` at project root, one json per route, `events.jsonl`, `screenshots/`, gitignored | Working files, not deliverables |
| 13 | Repo | `ksallee/llm-ui-annotation`, MIT, private for now | |
| 14 | Layout | pnpm monorepo: core, svelte, vite-plugin, cli, apps/reader, apps/demo | One package per agent |
| 15 | Screenshot | In-browser DOM-to-image (modern-screenshot), vectors as fallback | No prompts, no Playwright dependency |
| 16 | Briefs | `docs/specs/*.md`, agents in parallel worktrees, repo `CLAUDE.md` | No GitHub issues for now |
| 17 | Merging | Straight to `main` while private; PR review once public | |

Deferred, not rejected: bookmarklet/standalone server, Svelte component and source location in payload, numbered pins, layout/placement mode (agentation), i18n, Claude Code hooks for hands-free wake-up.

# 06 · CLI and the agent contract

Owner: `packages/cli`. Binary `annot`. Node 22, ESM, deps allowed: none beyond core (hand-rolled arg parsing is fine; `cac` or `citty` acceptable if it stays under one dependency). Output is markdown by default because the reader is a language model; `--json` for machines.

## Why a CLI and not MCP

Claude Code can run a shell command in the background and is re-invoked when it exits. So a command that **blocks until feedback arrives, prints it, and exits** is a complete notification system with zero configuration. The rest are verbs that write status back. The agent never needs to know about ports or files.

## Discovery

`annot` finds `.annotations/` by walking up from `cwd` (or `--dir`, or `ANNOT_DIR`). If `server.json` exists, its `pid` is alive, and `GET /__annot/health` answers within 500 ms with a matching `protocolVersion`, the CLI uses HTTP. Otherwise it reads and writes the files directly through core helpers (`readRoute`, `writeRoute`, `appendEvent`) and prints a one-line notice `(dev server not running, writing files directly)` to stderr. `--no-http` forces the file path.

`reply` is the exception: no wire verb appends a message without a transition, so it always writes files. The plugin notices the external write and pushes `annot:route` to the overlay.

## Commands

```
annot watch [--since <seq>|--from-now] [--timeout <sec>] [--route <path>] [--level compact|standard|detailed]
```
Blocks until at least one `batch.sent`, `status.changed` to `acknowledged` by user (an answer), `status.changed` to `sent` by user from `review`/`approved` (a reopen), or `thread.message` by user arrives after the cursor. Events by the agent never wake it. Waits 1.5 s after the first event to collect the rest of the batch, then prints the markdown from `renderBatchMarkdown` for each batch (answers and reopens are rendered as their own short sections) followed by a line `cursor: <seq>` and exits 0. On timeout exits 124 with no stdout. Cursor file `<dir>/.cursor-<agentName>` (`--agent`, `ANNOT_AGENT`, default `agent`) is written when something was delivered, so a plain `annot watch` in a loop never re-delivers; `--since` overrides, `--from-now` skips backlog, `--no-cursor` leaves it alone. The 1.5 s collection window is `ANNOT_COLLECT_MS` for tests. Default timeout 540 s (Claude Code's Bash tool caps at 600 s); the doc recommends `run_in_background`.

```
annot pending [--route <path>] [--level …]      everything in sent|acknowledged|question (grouped by route). Idempotent. Exit 0 even if empty.
annot show <id…> [--level detailed]             full annotation(s) incl. thread and screenshot path
annot ack <id…>                                 sent → acknowledged
annot ask <id> "<question>"                      → question, appends message kind question
annot done <id…> --summary "<what changed>"     → review, resolution changed
annot decline <id…> --reason "<why>"            → review, resolution declined
annot reply <id> "<text>"                       appends comment message without changing status
annot attach <id> <file…>                       adds files to an annotation (the user sees them in the panel)
annot screenshot <id> [--open]                  prints absolute path (agent then Reads the image)
annot routes                                    routes with counts
annot init [--claude-md] [--gitignore]          adds .annotations/ to .gitignore, appends the agent section to CLAUDE.md (idempotent, marked with <!-- annot:start/end -->), prints the vite snippet
annot doctor                                    checks dir, server, cursor, protocol version
```

`<id>` accepts full ids, unique prefixes, or `#<number>` (with `--route` when ambiguous). All mutating commands print the resulting status line, e.g. `#4 → review (changed)`; `reply` prints `#4 → acknowledged (comment)`. Exit 2 on illegal transition with the allowed moves listed, 124 on `watch` timeout, 1 on anything else.

## Markdown the agent reads

Exactly `renderBatchMarkdown` from spec 01. For page-mode items the screenshot line is an absolute path so the agent can `Read` it. An item with attachments carries the same block `show` and `pending` print at every level, absolute for the same reason:

```
attachments:
  /repo/.annotations/attachments/01J8…/01J9….png   mock-v2.png (image/png, 240 KB)
  /repo/.annotations/attachments/01J8…/01JA….pdf   brand-spec.pdf (application/pdf, 1.1 MB)
```

`annot attach` goes through the dev server when it is up (`?by=agent`, so the file is not credited to the user) and writes files otherwise; the type sniffing and the caps of spec 11 §1 apply on both paths, and an unsupported type exits 1 with the accepted list. Each item ends with its full id so `annot done <id>` can be copy-pasted. The footer reminds the verbs.

Answers and reopens:

```
## Answer on #4 (01J8…)
Q (agent): Should the Free button also grow, or only Pro?
A (user): Only Pro. Free stays 40px.
→ status acknowledged, continue.

## Reopened #6 (01J8…), new batch 01J9…
User: The gaps are still uneven on the middle card.
```

## The agent section for the host project's CLAUDE.md

Written by `annot init --claude-md`:

```markdown
<!-- annot:start -->
## UI feedback via annot

This project uses llm-ui-annotation. The user annotates the running UI in the browser; the feedback lands in `.annotations/`.

- When asked to "watch for feedback" or "pick up annotations", run `annot watch` with `run_in_background` and keep working; when it exits, read its output, then start another `annot watch` before doing anything else so nothing is missed.
- For each item: `annot ack <id>`, locate the code with the selector / quote / screenshot, make the change, then `annot done <id> --summary "<one or two sentences: what changed, where>"`. If you will not do it, `annot decline <id> --reason "..."`.
- An item may carry an `attachments:` block of absolute paths — a mock, a PDF, notes the user dropped on it. Read them before changing anything; `annot attach <id> <file…>` hands a file back the other way.
- If the request is ambiguous, `annot ask <id> "<one precise question>"` and move on to other items; the answer arrives through `annot watch`.
- Keep summaries concrete (file and what changed). The user reads them in the browser before approving.
- Do not edit files under `.annotations/` by hand.
<!-- annot:end -->
```

## Acceptance criteria

- `annot attach` is covered on both paths: file mode stores the bytes and appends `annotation.updated`; HTTP mode goes through the plugin; both list the file in `pending` at every level; a ZIP exits 1 naming the accepted types.
- Vitest: run the CLI against (a) a temp dir with fixture files and no server, (b) a stub of the spec 01 wire API, (c) a live plugin server from spec 05. Most cases call `run(argv, io)` in process for speed; a smaller suite spawns `dist/bin.js` to pin the exit codes. Cover every command, id resolution by prefix and `#number`, cursor persistence, `watch` waking on `batch.sent` within 2 s and on an answer, `watch` timeout exit code, `--json` shape, `init` idempotence (run twice → identical files).
- `annot --help` fits on one screen and lists the verbs in lifecycle order.
- README with the loop diagram and the CLAUDE.md section.

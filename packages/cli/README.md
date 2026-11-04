# @llm-ui-annotation/cli

The `annot` binary. A coding agent runs it to receive UI feedback from the browser and to answer it. Storage is `.annotations/` in the project; when the Vite dev server is up the CLI talks to it over HTTP, otherwise it reads and writes the files itself.

## The loop

```
  browser                    .annotations/                 agent
     │  send batch  ────────────▶ events.jsonl ──wakes──▶  annot watch   (blocks, exits 0)
     │                                                       │
     │                                                       ├─ annot ack <id>
     │                                                       ├─ annot ask <id> "…"  ──┐
     │  ◀── question shown in the overlay ─────────────────────────────────────────────┘
     │  answer  ────────────────▶ events.jsonl ──wakes──▶  annot watch
     │                                                       ├─ edit the code
     │                                                       └─ annot done <id> --summary "…"
     │  ◀── review, user approves ──────────────────────────────┘
```

`annot watch` blocks, waits 1.5 s after the first event so a batch arrives whole, prints markdown, writes `<dir>/.cursor-<agent>` and exits 0. On timeout it exits **124** with no stdout, so a shell loop can just retry. Illegal transitions exit **2** with the allowed moves; every other failure exits 1.

## Commands

`annot --help` lists them in lifecycle order: `watch · pending · show · ack · ask · reply · done · decline · attach · routes · init · doctor`. Output is markdown because the reader is a language model; `--json` for machines.

## Setup

`annot init` creates `.annotations/`, adds it to `.gitignore`, writes the section below into the project's `CLAUDE.md` between `<!-- annot:start -->` / `<!-- annot:end -->` markers, and prints the Vite snippet. It is idempotent: running it twice produces an identical file.

<!-- annot:start -->
## UI feedback via annot

This project uses llm-ui-annotation. The user annotates the running UI in the browser; the feedback lands in `.annotations/`.

- When asked to "watch for feedback" or "pick up annotations", run `annot watch` with `run_in_background` and keep working; when it exits, read its output, then start another `annot watch` before doing anything else so nothing is missed.
- For each item: `annot ack <id>`, locate the code with the selector / quote, make the change, then `annot done <id> --summary "<one or two sentences: what changed, where>"`. If you will not do it, `annot decline <id> --reason "..."`.
- An item may carry an `attachments:` block of absolute paths — a mock, a PDF, notes the user dropped on it. Read them before changing anything; `annot attach <id> <file…>` hands a file back the other way.
- If the request is ambiguous, `annot ask <id> "<one precise question>"` and move on to other items; the answer arrives through `annot watch`.
- Keep summaries concrete (file and what changed). The user reads them in the browser before approving.
- Do not edit files under `.annotations/` by hand.
<!-- annot:end -->

## Notes

- `<id>` is a full id, a unique id prefix, or `#<number>` (add `--route` when a number is ambiguous).
- `--no-http` forces the file path even when the dev server is up; `--no-cursor` leaves the watch cursor alone.
- `ANNOT_DIR` picks the annotations dir, `ANNOT_AGENT` the cursor name, `ANNOT_COLLECT_MS` the batch collection window.

## Known gaps

See `docs/known-gaps.md`.

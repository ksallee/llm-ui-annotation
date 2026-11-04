export const HELP = `annot — UI feedback for coding agents. Files in .annotations/, no MCP.

Usage: annot <command> [options]

  watch                        block until feedback lands, print it, exit 0 (124 on timeout)
  pending                      everything still waiting on the agent
  show <id…>                   one annotation in full, thread included
  ack <id…>                    sent → acknowledged: you have seen it and started
  ask <id> "<question>"        → question: ask the user one precise thing
  reply <id> "<text>"          add a comment without moving the status
  done <id…> --summary "…"     → review, resolution changed
  decline <id…> --reason "…"   → review, resolution declined
  attach <id> <file…>          add a file to an annotation the user can see
  routes                       routes with counts by status
  init [--claude-md] [--gitignore]   gitignore, CLAUDE.md section, vite snippet
  doctor                       dir, server, cursor, protocol version

Options
  --json                       machine-readable output
  --level <compact|standard|detailed>   detail per item (default standard)
  --route <path>               one route only; disambiguates #<number>
  --dir <path>                 annotations dir (default: nearest .annotations/)
  --since <seq>                watch: start after this event, ignoring the cursor
  --from-now                   watch: skip the backlog
  --timeout <sec>              watch: give up after this long (default 540)
  --agent <name>               cursor file name (default agent)
  --no-http                    never talk to the dev server, write files directly
  -h, --help                   this  ·  -v, --version

Loop: annot watch → ack → (ask) → done | decline → annot watch
`;

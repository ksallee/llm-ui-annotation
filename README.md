# llm-ui-annotation

Annotate a running UI in the browser and hand the feedback to a coding agent. Point at an element, select a run of text, or draw on the page; say what should change; send. The agent picks it up from files in your project, does the work, answers questions in a thread, and marks each item for review. You approve, the highlight disappears.

- Svelte 5 first, framework-free core.
- No MCP, no cloud: a Vite plugin writes `.annotations/`, a small `annot` CLI is what the agent runs.
- One accent in, a coherent light and dark palette out (oklch). Highlights, markers, popups and panel all follow it.
- Never mutates your app's DOM.

Status: specs written, implementation starting. See `docs/specs/00-overview.md`, `docs/decisions.md`, `docs/launch.md`.

MIT.

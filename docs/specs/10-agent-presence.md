# 10 · Agent presence

From the owner using the tool. Not started; this is the brief.

## Say whether an agent is listening

The owner sent a batch and nothing happened. The send was correct — created, sent, `batch.sent` on disk — but no process was running `annot watch`, and the overlay said *"Sent. Waiting for the agent."* That sentence is a lie when nothing is attached, and it is the one thing the UI must not lie about: the entire premise is that you hand work off to something else.

The plugin already knows. `GET /__annot/events/stream` is the agent's connection, so the count of open SSE clients is the answer.

- The plugin tracks open stream clients and pushes `annot:agents` with `{ count, since }` on change. `GET /__annot/health` also reports it, so the CLI's `doctor` can say it.
- `AnnotState` gains `agents: number`. The toolbar's send button and the panel header show it.
- Copy, when zero: the send toast reads **"Sent. No agent is watching — run `annot watch` in your project."** with the command selectable. When one or more: **"Sent. Waiting for the agent."** as today.
- The panel header shows a small presence line: `agent watching` / `no agent watching`. This replaces nothing; the dev-server connection dot from spec 09 §6 is a separate fact and both can be true or false independently.
- An annotation that has been `sent` for more than 60 s with no agent attached gets a quiet hint on its row, not a modal.

A cursor file (`<dir>/.cursor-<agent>`) proves an agent ran at some point, which is weaker but survives restarts; use it only to distinguish "no agent has ever run here" from "the agent is not running right now", and say which in the empty state.

## Acceptance criteria

- With no agent attached, sending shows the "no agent is watching" copy and names the command; starting `annot watch` flips the presence line within 2 s without a reload; stopping it flips back.
- `annot doctor` reports the number of attached agents.

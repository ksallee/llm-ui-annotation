# 13 · Style edits

Owner: `packages/svelte/src/dom/style-edit.ts`, `packages/svelte/src/ui/StyleEditors.svelte`, the
preview in `controller.ts`, `StyleEdit` in `packages/core/src/model/types.ts`.

## The problem we are fixing

"Make this roomier" is a guess at both ends: the user guesses a number, the agent guesses which
number they meant. The values are right there in the inspector, and the page can show a change
before anyone writes it in the source. So let the user change the value, see it, and send the
difference — with the name of the design token when the page has one, which is the part the agent
cannot infer from a pixel.

## The pending diff

`AnnotState.styleEdits: StyleEdit[]`, one entry per selector and property:

```ts
export interface StyleEdit {
  selector: string;   // an ElementRef.selector of the annotation this ends up on
  property: string;
  from: string;       // the computed value before the edit
  to: string;         // `var(--space-5)` when a token was picked, else the typed value
  token: string | null;
}
```

`setStyleEdit` replaces the entry for that selector and property, and drops it when `to` is empty or
comes back to `from` — an edit that changes nothing is not an edit. The list is not per annotation
while it is pending: it belongs to the session and rides with the **next note committed**, whatever
that note's target is. Each entry names its own selector, so nothing is ambiguous; and the
alternative — silently dropping edits that do not match the target — loses work the user did.

It ends in exactly three ways: the note is committed (`commitPopup` clears it), the user clears it
from the drawer, or the mode closes (`clearTransient`). There is no fourth, and no persistence: a
proposal never survives a reload.

## The editors

In the drawer, as the readings themselves (spec 12 §3), and the rows are **what the source
declares** — not a fixed list of properties we decided were interesting.

`matchedDeclarations(el)` walks the page's stylesheets for every rule whose selector matches the
element, reads `rule.style.cssText`, and keeps the last declaration per property, inline style last.
So a row shows the value **as written**: `padding: var(--demo-space-2) var(--demo-space-4)`, not the
computed `8px 16px`. If the page writes `padding-inline`, that is the row; if it writes
`padding-left`, that is the row. The panel reflects, it does not restructure. Cascade order without
specificity — the last matching rule wins, which is right for the flat stylesheets a page ships and
can differ from the browser on a contrived one.

Inheritable properties the element does not set itself are read off the nearest ancestor that does,
listed after its own and shown in italic: `font-size: var(--demo-text-base)` from `body` is a fact
about the element even though the element never mentions it.

A row is a text input for the value plus, when the page has tokens that fit, a select of them; a
value that names a token with no select to hold it shows the name beside it instead. `EDITABLE` is
no longer the list of rows — it is what `+ property` offers and where a property's `kind` and family
come from. Adding one gives it a row marked as an **override** (a rule the source does not have),
with a `×` that takes it off again.

## The preview

The one thing the overlay puts into the host page: a single `<style data-annot-preview>` in
`document.head`, holding one rule per selector with the pending declarations and `!important` — a
proposal has to beat the page's own specificity to be visible. It is written whenever `styleEdits`
changes and removed the moment the list is empty, which is what "revert on close" means in practice.

Two limits. A `>>>` selector crosses a shadow boundary, which no stylesheet can do, so those edits
are recorded but not previewed. And the preview shows the value on the live element only — it does
not tell you which rule in the source should change. That is the agent's job, and it is why the
diff carries the token name.

This does not weaken the never-touch-the-host rule of spec 04. That rule is about rendering overlay
state — highlights, outlines, markers — in a page that Svelte is reconciling. This is the user's own
edit, in a stylesheet we own, torn down with the proposal.

## What the agent gets

`Annotation.styleEdits`, and in the markdown a diff block after the target and before the comment,
at **every** render level — it is an instruction, not description, so `compact` keeps it:

```diff
  [data-testid="signup"] {
-   padding: 8px 16px;
+   padding: var(--space-5);   /* --space-5 */
-   background-color: rgb(44, 138, 133);
+   background-color: var(--demo-accent);   /* --demo-accent */
  }
```

The selector is where the value was seen, not where the rule lives. The agent finds the rule.

## Protocol

`styleEdits` bumps `protocolVersion` to 3 (spec 01). `attachments` and `tokens` did not, because a
reader that predates them sees an annotation without them — a state it already handles. This one is
different: an old reader that drops the field silently loses half of what the user said.

## Acceptance criteria

- Changing `padding` in the drawer changes the live page, and clearing it puts the page back.
- The rows are the declarations the stylesheets make, with their authored values.
- The type editors offer the page's type scale first and its spacing scale under `other tokens`.
- With the drawer on Inspect, clicking an element selects it and does not open a note popup.
- `+ property`, then `padding-inline`, then a spacing token changes the horizontal padding alone and
  the note carries `padding-inline`; `×` takes the override off and the page with it.
- Picking the token a value already has leaves the pending count where it was.
- A colour row offers the page's colour tokens and no others; picking one writes `var(--name)` and the token name.
- The note created next carries both edits; the route file on disk holds them; the page reverts on commit.
- `annot pending` prints the diff block above the comment, at every detail level.
- An edit whose value returns to the computed value disappears from the list.
- Leaving Element mode clears the proposal and removes the injected stylesheet.

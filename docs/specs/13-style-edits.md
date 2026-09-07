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

In the drawer, as the readings themselves (spec 12 §3): one row per property, showing its value and
its token, both changeable. Only the design set gets an editor — `EDITABLE` in `style-edit.ts`:

| Group | Properties |
|-------|------------|
| Spacing | `padding` `margin` `gap` |
| Colour | `color` `background-color` `border-color` |
| Type | `font-family` `font-size` `font-weight` `line-height` `letter-spacing` `text-transform` `text-align` |
| Shape | `border-radius` `border-width` `box-shadow` `opacity` |

Every row shows the computed value even when it is `none` or `normal`, so a shadow or a gap can be
proposed where the page has neither. A row is a text input for the value plus, when the page has
tokens that fit, a select of them; a row whose property has no candidate token shows the input alone.
`text-align` and the other free-form properties match a token by **name** only, since their values
have no shape to match on.

Tokens come from `declaredTokens(doc, el)` — every custom property in scope for that element, by
name. Not `tokenMap`: that keeps one name per value, and a page where `--space-3` and `--text-xs` are
both `12px` must offer both here.

Two filters decide what a row shows. `kindOf` classifies each token's value as `color`, `length`,
`shadow`, `family` or `free`, and a row offers only its own kind — a colour row never offers a
spacing token. Then `TOKEN_FAMILIES` (spec 12 §4) puts the tokens named for that property first and
the rest under an `other tokens` group. A designer looking for their type scale should not have to
read past the spacing scale to find it.

**The select shows the value's current token**, not an empty prompt: `namedToken` resolves what the
element already computes, so the row says `--demo-radius-md` before anything is changed. Seeing that
a value is *not* on the system is half of what the panel is for. A value of several parts names
several tokens, which no select can hold, so that case prints under the row instead:
`--demo-space-2 --demo-space-4`.

Picking a token writes `to: var(--name)` and `token: --name`; typing writes the raw value and
`token: null`. Colour rows carry a swatch and show their value as hex.

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
- The type editors offer the page's type scale first and its spacing scale under `other tokens`.
- With the drawer on Inspect, clicking an element selects it and does not open a note popup.
- A colour row offers the page's colour tokens and no others; picking one writes `var(--name)` and the token name.
- The note created next carries both edits; the route file on disk holds them; the page reverts on commit.
- `annot pending` prints the diff block above the comment, at every detail level.
- An edit whose value returns to the computed value disappears from the list.
- Leaving Element mode clears the proposal and removes the injected stylesheet.

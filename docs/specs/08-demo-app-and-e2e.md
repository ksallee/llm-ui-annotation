# 08 · Demo app and end-to-end tests

Owner: `apps/demo`. Svelte 5 + Vite + Playwright. The playground for every mode and the proof that the whole loop works.

## Pages

Four Vite MPA entries, so the paths carry a trailing slash: `/`, `/app/`, `/prose/`, `/hostile/`.

- `/` — a marketing-like page: nav, hero, three pricing cards, a feature list with icons, a footer. Uses Tailwind-style utility classes on purpose and Svelte scoped styles, so selector generation is exercised on ugly class soup.
- `/app/` — a dashboard: sidebar, data table with repeated rows and Edit buttons, a form with labelled inputs, a modal opened by a button, a sticky header, a card grid, a `<video>` and a CSS animation for freeze mode, a component in an open shadow root.
- `/prose/` — long text with repeated phrases for text-anchoring edge cases.
- `/hostile/` — a page with `* { all: unset }` and a dark `color-scheme` to prove the overlay is isolated and re-themes.

The demo mounts the overlay through the Vite plugin (auto-inject), with an accent picker in its own nav that writes `--annot-accent` on `:root` to prove "follow host" works live.

## Fake agent

`apps/demo/scripts/fake-agent.mjs`: loops on `annot watch --timeout 30`, and for each item: `ack`, then by comment prefix: `ask:` → asks "Which one?"; `decline:` → declines; anything else → `done --summary "fake: would change <selector>"`. Used by e2e and handy for manual demos.

## Playwright suites (`apps/demo/e2e/`)

1. **element**: activate, hover shows label chip, click opens popup with breadcrumb, add draft, send batch, route file contains `ElementTarget` with a selector that `document.querySelector` resolves to the same element; marker turns solid.
2. **multi-select**: marquee over the three cards → one annotation with 3 elements.
3. **text**: select a phrase that appears twice on `/prose`, annotate the second; the target's prefix/suffix disambiguate; reload → highlight on the second occurrence.
4. **page**: draw a rect + arrow + label, annotate; screenshot file exists, is a valid PNG with the expected size cap, `elements` non-empty. Needs the optional `modern-screenshot` peer, which `apps/demo` installs.
5. **loop**: start the fake agent; send three annotations with comments `fix`, `ask: …`, `decline: …`; assert statuses become `review`, `question`, `review(declined)`; answer the question in the panel → agent completes it; Approve all → no markers or outlines remain, panel Done filter shows 3.
6. **immediate mode**: switch setting, add → status `sent` immediately, badge does not count drafts.
7. **theming**: change the accent on `/hostile`; computed color of the pill, a marker, and a text highlight all change; contrast check of ink on surface ≥ 4.5 for three accents.
8. **isolation**: on `/hostile/`, the overlay's buttons have their styles and the host's `all: unset` did not leak; no attribute or class added to any host element after a full session (diff `outerHTML` of `main` before/after). The only `data-annot-*` node in the head is `<style data-annot-highlights>`; freeze mode adds `<style data-annot-freeze>` while it is on, so the check runs with animations resumed.
9. **shortcuts and blocking**: `E`, click a host button → the host click did not fire; `⌘`+click → it did. Plus spec 09 §2: nothing but `⌥A` fires while idle, the scoped keys fire in a mode, `⌘↵` sends.
10. **palette** (spec 09 §3): `⌥A` opens it, it filters by comment text and jumps to `#N`, it never offers a loop transition, the key rebinds and survives a reload, and the drawing bar exists only in Draw.
11. **panel** (spec 09 §8, §9): a collapsed row sends its draft without expanding; three `review` rows approve together with one undo toast; a mixed selection disables the illegal transitions.
12. **a11y**: axe-core scan of the overlay with the popup and panel open: no serious violations.
13. **inspector** (spec 12 §1–§3): a selection switches an open drawer to Inspect and deselecting
    switches it back, a closed drawer stays closed, the toggle holds until the selection changes;
    the box model draws over a padded element and draws nothing under 24×24; "what the agent will
    see" matches the `styles` stored on the annotation, key for key.

## Harness

No Playwright `webServer`. A test-scoped fixture starts a Vite dev server in-process against a fresh
temporary `ANNOT_DIR`, so no two tests share storage. Each worker gets its own Vite `cacheDir`,
because concurrent dev servers sharing one dependency cache serve `504 Outdated Optimize Dep` at
each other; a global setup warms the first cache and copies it to the rest.

One suite per file in `apps/demo/e2e/`.

## Acceptance criteria

- `pnpm --filter demo e2e` runs all suites headless in CI in under 5 minutes on a laptop.
- A GitHub Actions workflow `ci.yml` runs check, lint, unit tests, and e2e on push to `main` and on PRs (kept simple; the repo is private for now).
- README with two screenshots of the loop, re-shot by `scripts/screenshots.mjs`.

// Regenerate docs/design/theme-sheet.html from the palette in packages/core.
//   pnpm --filter @llm-ui-annotation/core build && node docs/design/theme-sheet.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeTheme,
  contrast,
  parseColor,
  SAMPLE_ACCENTS,
  SIGNAL_NAMES,
  TOKEN_NAMES,
} from '../../packages/core/dist/theme/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMES = ['light', 'dark'];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ratio = (t, a, b) => contrast(t[a], t[b]).toFixed(2);

const styleAttr = (t) => esc(TOKEN_NAMES.map((n) => `${n}:${t[n]}`).join(';'));

const swatch = (t, name, label = name.replace('--annot-', '')) =>
  `<div class="sw"><span class="chip" style="background:${esc(t[name])}"></span><code>${esc(label)}</code></div>`;

const inkRow = (t, ink, surfaces) => `
        <tr>
          <th><code>${esc(ink.replace('--annot-', ''))}</code></th>
          ${surfaces
            .map(
              (s) =>
                `<td style="background:${esc(t[s])};color:${esc(t[ink])}">Aa <b>${ratio(t, ink, s)}</b></td>`,
            )
            .join('')}
        </tr>`;

const signalRow = (t, name) => `
        <tr>
          <th><code>${esc(name)}</code></th>
          <td class="solid" style="background:${esc(t[`--annot-${name}`])};color:${esc(t[`--annot-${name}-ink`])}">
            ink <b>${ratio(t, `--annot-${name}-ink`, `--annot-${name}`)}</b>
          </td>
          <td class="patch" style="background:${esc(t[`--annot-${name}-fill`])};outline:2px solid ${esc(t[`--annot-${name}`])}">fill</td>
          <td class="patch" style="background:${esc(t[`--annot-${name}-wash`])};outline:1px solid ${esc(t[`--annot-${name}`])}">wash</td>
        </tr>`;

const chrome = (t) => `
      <div class="chrome">
        <div class="card">
          <div class="crumb">&rsaquo; button "Save"</div>
          <p>The button label is off-centre by a pixel.</p>
          <div class="crumb muted">panel · popup · surface</div>
        </div>
        <div class="markers">
          ${SIGNAL_NAMES.slice(3, 8)
            .map(
              (n, i) =>
                `<span class="marker" style="background:${esc(t[`--annot-${n}`])};color:${esc(t[`--annot-${n}-ink`])};box-shadow:0 0 0 2px ${esc(t['--annot-surface'])}">${i + 1}</span>`,
            )
            .join('')}
        </div>
        <div class="pill">
          <span class="tool active">element</span><span class="divider"></span>
          <span class="tool">text</span><span class="tool">page</span>
        </div>
      </div>`;

const schemeBlock = (t, scheme) => `
    <div class="scheme" data-scheme="${scheme}" style="${styleAttr(t)}">
      <h3>${scheme}</h3>
      ${chrome(t)}
      <h4>Accent</h4>
      <div class="swatches">
        ${['--annot-accent', '--annot-accent-soft', '--annot-accent-line', '--annot-accent-ink'].map((n) => swatch(t, n)).join('')}
      </div>
      <h4>Ink on surface</h4>
      <table class="grid">
        <thead><tr><th></th><th>surface</th><th>surface-2</th><th>surface-3</th><th>accent-soft</th></tr></thead>
        <tbody>
          ${['--annot-ink', '--annot-ink-2', '--annot-ink-3']
            .map((ink) =>
              inkRow(t, ink, ['--annot-surface', '--annot-surface-2', '--annot-surface-3', '--annot-accent-soft']),
            )
            .join('')}
        </tbody>
      </table>
      <h4>Pill (inverted)</h4>
      <table class="grid">
        <thead><tr><th></th><th>pill</th><th>hover</th><th>active</th></tr></thead>
        <tbody>${inkRow(t, '--annot-pill-ink', ['--annot-pill', '--annot-pill-hover', '--annot-pill-active'])}</tbody>
      </table>
      <h4>Status and mode</h4>
      <table class="grid signals"><tbody>${SIGNAL_NAMES.map((n) => signalRow(t, n)).join('')}</tbody></table>
      <h4>Drawing palette</h4>
      <div class="swatches">
        ${['--annot-stroke-1', '--annot-stroke-2', '--annot-stroke-3', '--annot-stroke-4', '--annot-stroke-5'].map((n) => swatch(t, n)).join('')}
      </div>
      <h4>Every token</h4>
      <table class="tokens"><tbody>
        ${TOKEN_NAMES.map((n) => {
          const color = parseColor(t[n]);
          const chip = color ? `<span class="chip" style="background:${esc(t[n])}"></span>` : '<span class="chip none"></span>';
          return `<tr><td>${chip}</td><th><code>${esc(n)}</code></th><td><code>${esc(t[n])}</code></td></tr>`;
        }).join('')}
      </tbody></table>
    </div>`;

const panels = Object.entries(SAMPLE_ACCENTS)
  .map(
    ([label, accent]) => `
  <section class="panel" data-accent="${esc(label)}">
    <h2>${esc(label)} <code>${esc(accent)}</code></h2>
    <div class="cols">${SCHEMES.map((s) => schemeBlock(computeTheme({ accent, scheme: s }), s)).join('')}</div>
  </section>`,
  )
  .join('');

const names = Object.keys(SAMPLE_ACCENTS);
const radios = names
  .map((n, i) => `<input type="radio" name="accent" id="pick-${esc(n)}"${i === 0 ? ' checked' : ''}>`)
  .join('\n  ');
const tabs = names.map((n) => `<label for="pick-${esc(n)}">${esc(n)}</label>`).join('');
const reveal = names
  .map((n) => `#pick-${n}:checked ~ main .panel[data-accent="${n}"]`)
  .join(',\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>llm-ui-annotation · theme sheet</title>
<style>
  :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  body { margin: 0; padding: 24px; background: #f4f4f5; color: #18181b; font-size: 13px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .lede { margin: 0 0 16px; color: #52525b; max-width: 70ch; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
  input[name="accent"] { position: absolute; opacity: 0; pointer-events: none; }
  .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px; }
  .tabs label { padding: 6px 12px; border-radius: 999px; background: #e4e4e7; cursor: pointer; }
  .tabs label:hover { background: #d4d4d8; }
  ${names.map((n) => `#pick-${n}:checked ~ .tabs label[for="pick-${n}"]`).join(',\n  ')} { background: #18181b; color: #fafafa; }
  .panel { display: none; }
  ${reveal} { display: block; }
  .panel > h2 { font-size: 15px; margin: 0 0 12px; display: flex; gap: 8px; align-items: baseline; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; align-items: start; }
  .scheme { padding: 16px; border-radius: 12px; background: var(--annot-surface); color: var(--annot-ink);
            font-family: var(--annot-font); font-size: var(--annot-text-md); box-shadow: var(--annot-shadow); }
  .scheme h3 { margin: 0 0 12px; font-size: var(--annot-text-lg); text-transform: capitalize; }
  .scheme h4 { margin: 20px 0 8px; font-size: var(--annot-text-sm); text-transform: uppercase;
               letter-spacing: .06em; color: var(--annot-ink-3); }
  .chrome { display: grid; gap: 12px; }
  .card { background: var(--annot-surface); border: 1px solid var(--annot-line); border-radius: var(--annot-radius);
          box-shadow: var(--annot-shadow); padding: var(--annot-space-3); max-width: var(--annot-popup-w); }
  .card p { margin: 8px 0; }
  .crumb { font-family: var(--annot-font-mono); font-size: var(--annot-text-mono); color: var(--annot-ink-2); }
  .crumb.muted { color: var(--annot-ink-3); }
  .markers { display: flex; gap: 8px; }
  .marker { width: var(--annot-marker-size); height: var(--annot-marker-size); border-radius: var(--annot-radius-marker);
            display: grid; place-items: center; font-size: var(--annot-text-sm); font-weight: 600; }
  .pill { display: inline-flex; align-items: center; gap: 4px; height: var(--annot-pill-h); padding: 0 12px;
          border-radius: var(--annot-radius-pill); background: var(--annot-pill); color: var(--annot-pill-ink); }
  .pill .tool { padding: 6px 10px; border-radius: var(--annot-radius-sm); }
  .pill .tool.active { background: var(--annot-pill-active); }
  .pill .divider { width: 1px; align-self: stretch; margin: 10px 4px; background: currentColor; opacity: .25; }
  table { border-collapse: collapse; width: 100%; }
  .grid th, .grid td { padding: 8px; text-align: left; font-weight: 400; border-radius: var(--annot-radius-sm); }
  .grid thead th { font-size: var(--annot-text-xs); color: var(--annot-ink-3); padding-bottom: 4px; }
  .grid tbody th { width: 5.5rem; color: var(--annot-ink-2); }
  .grid b { font-variant-numeric: tabular-nums; }
  .signals .solid { width: 9rem; }
  .signals .patch { width: 5rem; text-align: center; font-size: var(--annot-text-xs); color: var(--annot-ink-2); }
  .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
  .sw { display: flex; align-items: center; gap: 6px; }
  .chip { width: 20px; height: 20px; border-radius: var(--annot-radius-sm); display: inline-block;
          box-shadow: inset 0 0 0 1px var(--annot-line); }
  .chip.none { background: repeating-linear-gradient(45deg, transparent, transparent 3px, var(--annot-line) 3px, var(--annot-line) 4px); }
  .tokens td, .tokens th { padding: 2px 6px; text-align: left; font-weight: 400; vertical-align: middle; }
  .tokens th code { color: var(--annot-ink-2); }
  .tokens tr:nth-child(even) { background: var(--annot-surface-2); }
</style>
</head>
<body>
  <h1>Theme sheet</h1>
  <p class="lede">Every token and every status/mode swatch for the six sample accents, both schemes. Numbers on
  the ink cells are WCAG 2.x contrast ratios; the palette holds every one of them at 4.5 or better.
  Generated by <code>docs/design/theme-sheet.mjs</code> &mdash; edit the palette, not this file.</p>
  ${radios}
  <div class="tabs">${tabs}</div>
  <main>${panels}
  </main>
</body>
</html>
`;

writeFileSync(join(here, 'theme-sheet.html'), html);
console.log('wrote docs/design/theme-sheet.html');

#!/usr/bin/env node
// Fails when the overlay source mutates DOM it does not own. Everything we render lives in the
// shadow root; the host page is read-only. Escape hatch: `annot-allow-host-mutation: <reason>` on
// the line or the line above.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '..', 'src');
const ALLOW = /annot-allow-host-mutation:\s*\S/;

const RULES = [
  [/\.classList\s*\.\s*(add|remove|toggle|replace)\s*\(/, 'classList mutation'],
  [/\.setAttribute\s*\(/, 'setAttribute'],
  [/\.removeAttribute\s*\(/, 'removeAttribute'],
  [/\.surroundContents\s*\(/, 'Range.surroundContents'],
  [/\.innerHTML\s*=/, 'innerHTML assignment'],
  [/\.outerHTML\s*=/, 'outerHTML assignment'],
  [/\.insertAdjacentHTML\s*\(/, 'insertAdjacentHTML'],
  [/\.className\s*=/, 'className assignment'],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|svelte|js)$/.test(path)) yield path;
  }
}

const problems = [];
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (ALLOW.test(line) || ALLOW.test(lines[i - 1] ?? '')) return;
    for (const [re, what] of RULES) {
      if (re.test(line)) problems.push(`${relative(SRC, file)}:${i + 1}  ${what}  ${line.trim()}`);
    }
  });
}

if (problems.length > 0) {
  console.error('host mutation check failed:');
  for (const p of problems) console.error('  ' + p);
  console.error(`\n${problems.length} problem(s). Render into the shadow root instead, or annotate`);
  console.error('the line with `annot-allow-host-mutation: <reason>` when the node is ours.');
  process.exit(1);
}
console.log('host mutation check: clean');

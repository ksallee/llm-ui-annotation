#!/usr/bin/env node
// A scripted stand-in for the coding agent. Loops on `annot watch` and answers by comment prefix:
// `ask:` asks a question, `decline:` declines, anything else is acknowledged and completed.
//
//   ANNOT_DIR=.annotations node scripts/fake-agent.mjs [--timeout 30] [--once] [--quiet]

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const BIN = resolve(dirname(require.resolve('@llm-ui-annotation/cli/package.json')), 'dist/bin.js');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const timeout = String(flag('timeout', '30'));
const once = args.includes('--once');
const quiet = args.includes('--quiet');

const log = (...parts) => {
  if (!quiet) process.stderr.write(`[fake-agent] ${parts.join(' ')}\n`);
};

let child = null;
let stopping = false;

function annot(argv) {
  return new Promise((done) => {
    child = spawn(process.execPath, [BIN, ...argv], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      child = null;
      done({ code: code ?? 1, out, err });
    });
  });
}

function describe(annotation) {
  const target = annotation.target;
  if (target.kind === 'element') return target.elements[0]?.selector ?? 'the element';
  if (target.kind === 'text') return `“${target.quote.slice(0, 40)}”`;
  return `the region at ${Math.round(target.region.x)},${Math.round(target.region.y)}`;
}

async function handle(annotation) {
  const { id, comment } = annotation;
  const ack = await annot(['ack', id]);
  if (ack.code !== 0) {
    log('ack failed', id, ack.err.trim());
    return;
  }
  if (/^ask:/i.test(comment)) {
    await annot(['ask', id, comment.replace(/^ask:\s*/i, '') || 'Which one?']);
    log('asked', id);
    return;
  }
  if (/^decline:/i.test(comment)) {
    await annot(['decline', id, '--reason', `fake: not doing ${describe(annotation)}`]);
    log('declined', id);
    return;
  }
  await annot(['done', id, '--summary', `fake: would change ${describe(annotation)}`]);
  log('done', id);
}

async function complete(annotation, why) {
  await annot(['done', annotation.id, '--summary', `fake: ${why} ${describe(annotation)}`]);
  log('done', annotation.id, `(${why})`);
}

async function pass() {
  const { code, out } = await annot(['watch', '--json', '--timeout', timeout]);
  if (code === 124) return 'timeout';
  if (code !== 0) return 'error';
  let payload;
  try {
    payload = JSON.parse(out);
  } catch {
    log('unparseable watch output');
    return 'error';
  }
  for (const batch of payload.batches ?? []) {
    for (const annotation of batch.annotations) await handle(annotation);
  }
  for (const annotation of payload.answers ?? []) await complete(annotation, 'after your answer,');
  for (const annotation of payload.reopens ?? []) {
    await annot(['ack', annotation.id]);
    await complete(annotation, 'second pass on');
  }
  return 'handled';
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill('SIGTERM');
    process.exit(0);
  });
}

log('watching', process.env['ANNOT_DIR'] ?? '.annotations');
while (!stopping) {
  const result = await pass();
  if (once && result !== 'timeout') break;
}

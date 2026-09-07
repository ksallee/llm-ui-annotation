#!/usr/bin/env node
// Convert a sit_hathor `<doc>.notes.json` into an llm-ui-annotation route file.
//
//   node scripts/migrate-notes.mjs path/to/doc.md [--force] [--out <dir>]
//
// Reads `<doc>.notes.json` (or `<doc without extension>.notes.json`), writes
// `<dirname(doc)>/.annotations/routes/<slug>.json` and prints the counts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyTransition, newId, nowIso, routeFile } from '@llm-ui-annotation/core';

const STATUS = { open: 'sent', handled: 'review', done: 'approved' };
const MIGRATED = 'migrated';

/** Both spellings the prototype used for the notes file. */
export function notesPaths(doc) {
  const withoutExt = doc.replace(/\.[^./]+$/, '');
  return [`${doc}.notes.json`, `${withoutExt}.notes.json`];
}

export function readNotes(doc) {
  for (const path of notesPaths(doc)) {
    if (!existsSync(path)) continue;
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const notes = Array.isArray(parsed) ? parsed : (parsed.notes ?? []);
    if (!Array.isArray(notes)) throw new Error(`${path}: no notes array`);
    return { path, notes };
  }
  throw new Error(`no notes file next to ${doc} (tried ${notesPaths(doc).join(', ')})`);
}

const text = (note) => String(note.note ?? note.text ?? note.comment ?? '').trim();
const stamp = (value, fallback) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;

function container(note) {
  const key = `${note.section ?? 'body'}/${note.pi ?? 0}`;
  return {
    selector: `[data-annot-block=${JSON.stringify(key)}]`,
    fallbacks: [],
    tag: 'p',
    role: null,
    name: 'paragraph',
    text: String(note.quote ?? ''),
    rect: { x: 0, y: 0, width: 0, height: 0 },
    fixed: false,
    attrs: { 'data-annot-block': key },
  };
}

/** One legacy note as a `draft` annotation, before the status chain is applied. */
function draft(note, route, number, at) {
  const quote = String(note.quote ?? '');
  const comment = text(note) || quote;
  return {
    id: newId(Date.parse(at) || Date.now()),
    protocolVersion: 1,
    route,
    url: route,
    mode: 'text',
    target: {
      kind: 'text',
      container: container(note),
      quote,
      prefix: '',
      suffix: '',
      start: Number(note.start ?? 0),
      end: Number(note.end ?? quote.length),
      rects: [],
    },
    comment,
    status: 'draft',
    thread: [{ id: newId(), role: 'user', kind: 'comment', text: comment, at }],
    batch: null,
    number,
    viewport: { width: 0, height: 0, dpr: 1, scrollX: 0, scrollY: 0 },
    createdAt: at,
    updatedAt: at,
    sentAt: null,
    resolvedAt: null,
    approvedAt: null,
    resolution: null,
  };
}

/** Legacy notes as annotations, plus a count per resulting status. */
export function convert(notes, route, now = nowIso()) {
  const counts = { sent: 0, review: 0, approved: 0, skipped: 0 };
  const annotations = [];

  for (const note of notes) {
    const target = STATUS[note.status ?? 'open'];
    if (!target) {
      counts.skipped++;
      continue;
    }
    const createdAt = stamp(note.createdAt ?? note.created ?? note.at, now);
    let a = draft(note, route, annotations.length + 1, createdAt);

    a = applyTransition(a, 'sent', 'user', undefined, stamp(note.sentAt, createdAt));
    if (target !== 'sent') {
      const summary = String(note.summary ?? note.handledNote ?? MIGRATED).trim() || MIGRATED;
      a = applyTransition(
        a,
        'review',
        'agent',
        { role: 'agent', kind: 'summary', text: summary },
        stamp(note.handledAt, now),
      );
    }
    if (target === 'approved') {
      a = applyTransition(a, 'approved', 'user', undefined, stamp(note.doneAt ?? note.validatedAt, now));
    }

    counts[target]++;
    annotations.push(a);
  }

  return { counts, annotations };
}

export function migrate(docPath, { force = false, out } = {}) {
  const doc = resolve(docPath);
  const { path: notesPath, notes } = readNotes(doc);
  const route = `/doc/${basename(doc)}`;
  const dir = out ? resolve(out) : join(dirname(doc), '.annotations');
  const file = join(dir, routeFile(route));

  if (existsSync(file) && !force) {
    throw new Error(`${file} already exists; pass --force to overwrite`);
  }

  const now = nowIso();
  const { counts, annotations } = convert(notes, route, now);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ route, updatedAt: now, nextNumber: annotations.length + 1, annotations }, null, 2)}\n`,
  );
  return { notesPath, file, route, counts, total: annotations.length };
}

function main(argv) {
  const args = argv.filter((a) => a !== '--force');
  const outAt = args.indexOf('--out');
  const out = outAt === -1 ? undefined : args[outAt + 1];
  if (outAt !== -1) args.splice(outAt, 2);
  const doc = args[0];
  if (!doc) {
    console.error('usage: migrate-notes.mjs <doc.md> [--force] [--out <dir>]');
    return 2;
  }
  const result = migrate(doc, { force: argv.includes('--force'), out });
  const { sent, review, approved, skipped } = result.counts;
  console.log(`read    ${result.notesPath}`);
  console.log(`wrote   ${result.file}`);
  console.log(`route   ${result.route}`);
  console.log(
    `notes   ${result.total} migrated · ${sent} sent · ${review} review · ${approved} approved · ${skipped} skipped`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(String(error?.message ?? error));
    process.exit(1);
  }
}

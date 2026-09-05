#!/usr/bin/env node
// Drive the overlay in a real headless browser and print only what was asked for.
//
// Why a script and not a browser MCP: an MCP returns an accessibility snapshot and a console log on
// every call, which is most of what a UI session costs. This is a CLI that writes to disk and lets
// the agent read back only its own answer — the drive script's return value, as JSON, and nothing
// else. Screenshots go to a file you look at when you need to, not into the transcript.
//
//   tools/qa.mjs --app apps/demo --drive drive.js --shot /tmp/out.png
//   tools/qa.mjs --url http://127.0.0.1:5173/ --drive - <<'JS'
//     await click('[data-mode="element"]'); return { modes: shAll('.mode').map(text) };
//   JS
//
// --app starts an isolated dev server: its own free port and its own .annotations/ directory, so
// two agents driving two worktrees never write over each other's routes. Without --app, --url is
// used as is and nothing is started or cleaned up.
//
// The drive file is the body of an async function. It receives, as locals:
//   wait(ms)  sleep
//   $ $$      querySelector / querySelectorAll in the HOST document, returning handles
//   sh shAll  the same, inside the overlay's shadow root — this is where the UI actually lives
//   click(s)  shadow-first click: tries the shadow root, then the host document
//   text(s)   trimmed textContent of the first match, shadow-first, '' when absent
//   type(s,v) fill an input, shadow-first
//   overlay   the <annot-overlay> element handle, or null when it never mounted
// Whatever it returns is JSON.stringify'd to stdout. Uncaught page errors are collected and
// reported under "errors" because a silent throw in the overlay is the thing you are usually
// chasing; nothing else is printed.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createConnection } from 'node:net';

const REPO = resolve(import.meta.dirname, '..');
const OVERLAY_TAG = 'annot-overlay';

function parseArgs(argv) {
  const a = {
    url: '', app: '', drive: '', shot: '', video: '', viewport: '1280x900',
    annotations: '', waitFor: '', timeout: 60, keep: false, noOverlay: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    const camel = { 'wait-for': 'waitFor', 'no-overlay': 'noOverlay' }[k] ?? k;
    if (!(camel in a)) throw new Error(`unknown flag: ${argv[i]}`);
    if (typeof a[camel] === 'boolean') a[camel] = true;
    else a[camel] = argv[++i];
  }
  return a;
}

const freePort = (start) => new Promise((done) => {
  const probe = (p) => {
    if (p > start + 60) throw new Error('no free port');
    const s = createConnection({ port: p, host: '127.0.0.1' });
    s.on('connect', () => { s.destroy(); probe(p + 1); });
    s.on('error', () => done(p));
  };
  probe(start);
});

async function waitForHttp(url, seconds) {
  for (let i = 0; i < seconds * 4; i++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return false;
}

// An isolated dev server: own port, own .annotations/. The isolation is the point — every worktree
// runs the same app on the same default port and writes the same route files, so without it an
// agent verifies someone else's state instead of its own.
async function startApp(appDir, annotationsDir) {
  const port = await freePort(5300);
  const proc = spawn(
    'pnpm', ['--dir', resolve(REPO, appDir), 'exec', 'vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: REPO, stdio: 'ignore', env: { ...process.env, ANNOT_DIR: annotationsDir } },
  );
  return { proc, port, url: `http://127.0.0.1:${port}/` };
}

// Runs in the page. Waits for the custom element to be defined AND for its shadow root to have
// painted something: `customElements.whenDefined` resolves before the first render, so a drive
// script that queries straight away finds an empty shadow root and reports a UI that is not there.
async function boot({ drive, tag, waitFor, noOverlay }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let overlay = null;
  if (!noOverlay) {
    for (let i = 0; i < 120; i++) {
      overlay = document.querySelector(tag);
      if (overlay?.shadowRoot?.childElementCount) break;
      await wait(250);
    }
  }
  const root = overlay?.shadowRoot ?? null;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sh = (s) => root?.querySelector(s) ?? null;
  const shAll = (s) => (root ? [...root.querySelectorAll(s)] : []);
  const pick = (s) => sh(s) ?? $(s);
  const text = (s) => (typeof s === 'string' ? pick(s) : s)?.textContent?.trim() ?? '';
  const click = async (s) => {
    const el = pick(s);
    if (!el) throw new Error('click: no element for ' + s);
    el.click();
    await wait(60);
    return true;
  };
  const type = async (s, v) => {
    const el = pick(s);
    if (!el) throw new Error('type: no element for ' + s);
    el.focus();
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(60);
    return true;
  };
  if (waitFor) {
    for (let i = 0; i < 120; i++) { if (pick(waitFor)) break; await wait(250); }
  }
  const ctx = { overlay, root, wait, $, $$, sh, shAll, text, click, type };
  const fn = new Function('ctx', 'return (async () => { const {overlay, root, wait, $, $$, sh, shAll, text, click, type} = ctx; ' + drive + ' })()');
  return await fn(ctx);
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.url && !a.app) throw new Error('need --url or --app');

  const annotationsDir = a.annotations || mkdtempSync(resolve(tmpdir(), 'annot-qa-'));
  let started = null;
  let url = a.url;
  if (a.app) {
    started = await startApp(a.app, annotationsDir);
    url = started.url;
    if (!await waitForHttp(url, a.timeout)) {
      started.proc.kill();
      console.log(JSON.stringify({ error: `dev server for ${a.app} did not come up on ${url}` }));
      return 1;
    }
  }

  const drive = a.drive === '-' ? readFileSync(0, 'utf8') : a.drive ? readFileSync(a.drive, 'utf8') : 'return {};';
  const [vw, vh] = a.viewport.toLowerCase().split('x').map(Number);

  const { chromium } = await import('playwright');
  const out = {};
  const errors = [];
  let browser, ctx;
  try {
    browser = await chromium.launch({ headless: true });
    // Video is a context setting and the file is only finalised when the context closes, so its
    // path is read back after close, never before.
    ctx = await browser.newContext({
      viewport: { width: vw, height: vh },
      ...(a.video ? { recordVideo: { dir: dirname(resolve(a.video)), size: { width: vw, height: vh } } } : {}),
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { if (errors.length < 10) errors.push(String(e.message ?? e)); });
    page.on('console', (m) => { if (m.type() === 'error' && errors.length < 10) errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const value = await page.evaluate(boot, {
      drive, tag: OVERLAY_TAG, waitFor: a.waitFor, noOverlay: a.noOverlay,
    });
    if (value !== undefined && value !== null) Object.assign(out, { value });
    if (a.shot) {
      mkdirSync(dirname(resolve(a.shot)), { recursive: true });
      await page.screenshot({ path: resolve(a.shot), fullPage: false });
      out.shot = resolve(a.shot);
    }
    const videoSrc = a.video ? await page.video().path() : null;
    await ctx.close();
    if (videoSrc) { renameSync(videoSrc, resolve(a.video)); out.video = resolve(a.video); }
    await browser.close();
  } catch (e) {
    // First line only: the rest is Playwright's own eval frames, which cost tokens and say nothing.
    out.error = String(e?.message ?? e).split('\n')[0];
    try { await ctx?.close(); await browser?.close(); } catch { /* already down */ }
  } finally {
    if (started && !a.keep) {
      started.proc.kill('SIGTERM');
      if (!a.annotations) rmSync(annotationsDir, { recursive: true, force: true });
    }
  }
  if (errors.length) out.errors = [...new Set(errors)];
  if (a.keep && started) out.url = started.url;
  console.log(JSON.stringify(out, null, 1));
  return out.error ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.log(JSON.stringify({ error: String(e.message ?? e) })); process.exit(1); });

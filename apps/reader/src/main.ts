import { autoMount } from '@llm-ui-annotation/svelte';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { docMeta, fetchDoc } from './doc.js';
import { applyReaderTheme, loadPrefs, READER_ACCENT } from './theme.js';

const meta = docMeta(document);
applyReaderTheme(document, loadPrefs(window));

const mounting = autoMount({
  accent: READER_ACCENT,
  scheme: 'auto',
  mode: 'text',
  sendMode: 'immediate',
  routeKey: meta.route,
  hot: import.meta.hot ?? null,
});

void (async () => {
  const [overlay, initial] = await Promise.all([mounting, fetchDoc()]);
  const target = document.getElementById('app');
  if (target) mount(App, { target, props: { initial, overlay, hot: import.meta.hot } });
})();

import type { Status } from '@llm-ui-annotation/core';
import type { ThemeTokens } from '../theme/index.js';

const STYLE_ID = 'data-annot-highlights';
const PAINTED: Status[] = ['draft', 'sent', 'acknowledged', 'question', 'review'];

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

interface HighlightApi {
  highlights?: HighlightRegistry;
}

type HighlightCtor = new (...ranges: Range[]) => unknown;

function registry(doc: Document): HighlightRegistry | null {
  const css = (doc.defaultView as unknown as { CSS?: HighlightApi })?.CSS;
  return css?.highlights ?? null;
}

/** True when the browser can paint ranges without touching the DOM. */
export function supportsHighlights(doc: Document): boolean {
  const view = doc.defaultView as unknown as { Highlight?: HighlightCtor } | null;
  return Boolean(registry(doc) && view?.Highlight);
}

/**
 * Put the `::highlight()` rules in the host head. This is the one node we add to the host
 * document; spec 08 whitelists it. Token values are inlined because custom properties defined on
 * the shadow host do not reach the host document.
 */
export function ensureHighlightStyle(doc: Document, tokens: ThemeTokens): () => void {
  const head = doc.head;
  if (!head) return () => {};
  let style = head.querySelector<HTMLStyleElement>(`style[${STYLE_ID}]`);
  if (!style) {
    style = doc.createElement('style');
    style.dataset.annotHighlights = '';
    head.append(style);
  }
  style.textContent = PAINTED.map(
    (status) => `::highlight(annot-${status}) {
  background-color: ${tokens[`--annot-${status}-fill`]};
  color: ${tokens[`--annot-${status}-ink`]};
}`,
  ).join('\n');
  return () => style?.remove();
}

/** Hand the live ranges to the browser, one highlight per status. */
export function paintHighlights(doc: Document, ranges: Map<Status, Range[]>): void {
  const store = registry(doc);
  const Ctor = (doc.defaultView as unknown as { Highlight?: HighlightCtor })?.Highlight;
  if (!store || !Ctor) return;
  for (const status of PAINTED) {
    const list = ranges.get(status) ?? [];
    if (list.length === 0) store.delete(`annot-${status}`);
    else store.set(`annot-${status}`, new Ctor(...list));
  }
}

export function clearHighlights(doc: Document): void {
  const store = registry(doc);
  if (!store) return;
  for (const status of PAINTED) store.delete(`annot-${status}`);
}

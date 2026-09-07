// The one thing the overlay puts in the host page: a stylesheet holding the change being proposed.

import type { StyleEdit } from '@llm-ui-annotation/core';
import { SHADOW_SEP } from './core-dom.js';

export const PREVIEW_ATTR = 'data-annot-preview';

// A brace ends the rule a selector or value sits in, so one carrying it could write rules of its
// own into the host page.
const CLOSES_RULE = /[{}]/;

/** One rule per element, `!important` so a specific host rule does not win over the proposal. */
function previewCss(edits: readonly StyleEdit[]): string {
  const bySelector = new Map<string, string[]>();
  for (const edit of edits) {
    // A `>>>` selector crosses a shadow boundary, which no stylesheet can do.
    if (edit.selector.includes(SHADOW_SEP)) continue;
    if (CLOSES_RULE.test(edit.selector) || CLOSES_RULE.test(edit.to)) continue;
    const decls = bySelector.get(edit.selector) ?? [];
    decls.push(`  ${edit.property}: ${edit.to} !important;`);
    bySelector.set(edit.selector, decls);
  }
  return [...bySelector]
    .map(([selector, decls]) => `${selector} {\n${decls.join('\n')}\n}`)
    .join('\n');
}

const sheetIn = (doc: Document): HTMLStyleElement | null =>
  doc.head?.querySelector<HTMLStyleElement>(`style[${PREVIEW_ATTR}]`) ?? null;

/** Show the pending edits on the page itself, or take them off when there are none. */
export function previewStyleEdits(doc: Document, edits: readonly StyleEdit[]): void {
  const head = doc.head;
  if (!head) return;
  const existing = sheetIn(doc);
  if (edits.length === 0) {
    existing?.remove();
    return;
  }
  const style = existing ?? doc.createElement('style');
  if (!existing) {
    style.dataset.annotPreview = '';
    head.append(style);
  }
  style.textContent = previewCss(edits);
}

export function clearStylePreview(doc: Document): void {
  sheetIn(doc)?.remove();
}

/**
 * Read the page with the proposal off. What an annotation carries has to be what the code says: the
 * preview is the user's suggestion, and it travels as `styleEdits`, not as the element's styles.
 */
export function withoutPreview<T>(doc: Document, read: () => T): T {
  const sheet = sheetIn(doc)?.sheet;
  if (!sheet) return read();
  sheet.disabled = true;
  try {
    return read();
  } finally {
    sheet.disabled = false;
  }
}

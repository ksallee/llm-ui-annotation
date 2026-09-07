/** Accessible-ish names for elements, for humans and for the agent. */

import { collapse, truncate } from './css.js';

const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'DESC', 'DEFS', 'METADATA']);
const VALUE_TAGS = new Set(['submit', 'reset', 'button', 'image']);

/** Collapsed visible text, ignoring script and style content. */
export function visibleText(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) out += node.nodeValue ?? '';
    else if (node.nodeType === 1 && !SKIP_TEXT.has((node as Element).tagName.toUpperCase()))
      out += ` ${visibleText(node as Element)}`;
  }
  return collapse(out);
}

function byIds(el: Element, ids: string): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  const parts = ids
    .split(/\s+/)
    .filter((id) => id !== '')
    .map((id) => {
      const target = root.querySelector(`#${id}`);
      return target ? visibleText(target) : '';
    });
  return collapse(parts.join(' '));
}

function labelText(el: Element): string {
  const id = el.getAttribute('id');
  const root = el.getRootNode() as Document | ShadowRoot;
  if (id) {
    for (const label of Array.from(root.querySelectorAll('label'))) {
      if (label.getAttribute('for') === id) return visibleText(label);
    }
  }
  const wrapping = el.closest('label');
  return wrapping ? visibleText(wrapping) : '';
}

function hrefTail(el: Element): string {
  const href = el.getAttribute('href');
  if (!href) return '';
  const path = href.split(/[?#]/)[0] ?? '';
  const segments = path.split('/').filter((s) => s !== '');
  return segments[segments.length - 1] ?? '';
}

function iconLabel(el: Element): string {
  const icon = el.querySelector('svg, img[alt]');
  if (!icon) return '';
  const aria = icon.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  const alt = icon.getAttribute('alt')?.trim();
  if (alt) return alt;
  const title = icon.querySelector('title');
  return title ? collapse(title.textContent ?? '') : '';
}

/** True when the element's only content is an icon. */
export function isIconOnly(el: Element): boolean {
  return visibleText(el) === '' && el.querySelector('svg, img') !== null;
}

const LABEL_MAX = 40;

/** Accessible-ish label, unformatted. Empty when nothing describes the element. */
export function labelOf(el: Element): string {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return truncate(collapse(aria), LABEL_MAX);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = byIds(el, labelledBy);
    if (text) return truncate(text, LABEL_MAX);
  }

  const label = labelText(el);
  if (label) return truncate(label, LABEL_MAX);

  const text = visibleText(el);
  if (text) return truncate(text, LABEL_MAX);

  for (const attr of ['alt', 'title', 'placeholder']) {
    const value = el.getAttribute(attr)?.trim();
    if (value) return truncate(collapse(value), LABEL_MAX);
  }

  const tail = hrefTail(el);
  if (tail) return tail;

  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (el.tagName === 'INPUT' && VALUE_TAGS.has(type)) return el.getAttribute('value')?.trim() ?? '';

  return iconLabel(el);
}

/** Human label: `button "Save"`, `input[email] "Work email"`, `button (icon)`. */
export function describeName(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const head = tag === 'input' ? `input[${(el.getAttribute('type') ?? 'text').toLowerCase()}]` : tag;
  const label = labelOf(el);
  const icon = isIconOnly(el) ? ' (icon)' : '';
  return label ? `${head} "${label}"${icon}` : `${head}${icon}`;
}

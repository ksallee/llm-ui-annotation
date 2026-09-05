import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Rect } from '../../src/model/types.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export const FIXTURES = [
  'ids',
  'classes',
  'list',
  'shadow',
  'chrome',
  'table',
  'form',
  'cards',
  'prose',
];

function attachShadows(root: ParentNode): void {
  for (const template of Array.from(root.querySelectorAll('template[data-shadow]'))) {
    const host = template.parentElement;
    if (!host) continue;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = template.innerHTML;
    template.remove();
    attachShadows(shadow);
  }
}

/** Give fixture elements a layout from their `data-rect` attribute. */
export function applyLayout(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll('[data-rect]'))) {
    const [x = 0, y = 0, width = 0, height = 0] = (el.getAttribute('data-rect') ?? '')
      .split(',')
      .map(Number);
    const box = { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
    (el as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ ...box, toJSON: () => box }) as DOMRect;
  }
}

export function loadFixture(name: string): Document {
  document.body.innerHTML = readFileSync(join(DIR, `${name}.html`), 'utf8');
  attachShadows(document.body);
  applyLayout(document);
  return document;
}

/** Every element in the document, shadow trees included. */
export function allElements(root: ParentNode): Element[] {
  const out: Element[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    out.push(el);
    if (el.shadowRoot) out.push(...allElements(el.shadowRoot));
  }
  return out;
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function setRect(el: Element, box: Rect): void {
  const full = {
    ...box,
    top: box.y,
    left: box.x,
    right: box.x + box.width,
    bottom: box.y + box.height,
  };
  (el as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ ...full, toJSON: () => full }) as DOMRect;
}

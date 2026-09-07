import { parseColor, toOklch } from '../theme/color.js';

const MAX_ENTRIES = 20;

const TEXT_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'li', 'label', 'td', 'th', 'button', 'input',
]);

const TEXT_PROPS = [
  'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
  'text-transform',
];

const BOX_PROPS = [
  'display', 'position', 'width', 'height', 'padding', 'margin', 'border-radius', 'border',
  'background-color', 'box-shadow', 'opacity', 'gap',
];

const LAYOUT_PROPS = ['flex-direction', 'align-items', 'justify-content', 'grid-template-columns'];

const COLOR_PROPS = new Set(['color', 'background-color']);
const ALWAYS = new Set(['width', 'height']);
const EMPTY = new Set(['', 'auto', 'none', 'normal', '0px', 'static', 'rgba(0, 0, 0, 0)', 'transparent']);

const probes = new WeakMap<Document, Map<string, Record<string, string>>>();

function read(style: CSSStyleDeclaration, props: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const prop of props) out[prop] = style.getPropertyValue(prop).trim();
  return out;
}

/** Computed values of an untouched element of `tag`, for comparison against the UA default. */
function probeDefaults(doc: Document, tag: string, props: string[]): Record<string, string> {
  let cache = probes.get(doc);
  if (!cache) probes.set(doc, (cache = new Map()));
  const hit = cache.get(tag);
  if (hit) return hit;

  let defaults: Record<string, string> = {};
  const view = doc.defaultView;
  const body = doc.body;
  if (view && body) {
    const holder = doc.createElement('div');
    holder.setAttribute('data-annot-probe', '');
    holder.setAttribute(
      'style',
      'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden',
    );
    try {
      const probe = doc.createElement(tag);
      holder.appendChild(probe);
      body.appendChild(holder);
      defaults = read(view.getComputedStyle(probe), props);
    } catch {
      defaults = {};
    } finally {
      holder.remove();
    }
  }
  cache.set(tag, defaults);
  return defaults;
}

function roundNumbers(value: string): string {
  return value.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));
}

/** Colors as `oklch(...)`, keeping a hex or named original in parentheses. */
export function formatStyleValue(prop: string, value: string): string {
  if (!COLOR_PROPS.has(prop) || !parseColor(value)) return roundNumbers(value);
  const oklch = toOklch(value);
  const original = /^#|^[a-z]+$/i.test(value.trim()) ? ` (${value.trim()})` : '';
  return `${oklch}${original}`;
}

function propsFor(tag: string, display: string): string[] {
  const out = TEXT_TAGS.has(tag) ? [...TEXT_PROPS, ...BOX_PROPS] : [...BOX_PROPS];
  if (display.includes('flex') || display.includes('grid')) out.push(...LAYOUT_PROPS);
  return out;
}

/** The style subset for `el`, limited to values that differ from the UA default. */
export function computedStyles(el: Element): Record<string, string> {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  if (!view) return {};

  const style = view.getComputedStyle(el);
  const tag = el.tagName.toLowerCase();
  const props = propsFor(tag, style.getPropertyValue('display'));
  const defaults = probeDefaults(doc, tag, props);

  const out: Record<string, string> = {};
  for (const prop of props) {
    if (Object.keys(out).length >= MAX_ENTRIES) break;
    const value = style.getPropertyValue(prop).trim();
    if (EMPTY.has(value)) continue;
    if (!ALWAYS.has(prop) && value === defaults[prop]) continue;
    out[prop] = formatStyleValue(prop, value);
  }
  return out;
}

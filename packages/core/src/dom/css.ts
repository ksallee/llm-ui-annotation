const GENERATED_ID_PREFIX = /^(svelte-|radix-|headlessui-|:r|_|__)/;
const HEX_RUN = /[0-9a-fA-F]{6,}/;
const NUMERIC_ID = /^[0-9]/;

const UNSTABLE_CLASS =
  /^(svelte-[a-z0-9]+|css-[a-z0-9]+|sc-|_[a-z0-9]{5,}|[a-z]+-[0-9a-f]{5,}$|[A-Za-z]+__[a-z0-9]{5,})/;
const UTILITY_CLASS =
  /^(p|m|px|py|mx|my|w|h|gap|text|bg|flex|grid|items|justify|rounded|border|shadow|font|leading|tracking)-/;
const UTILITY_WORDS = new Set([
  'flex', 'grid', 'block', 'inline', 'hidden', 'border', 'rounded', 'shadow', 'container', 'absolute',
  'relative', 'fixed', 'static', 'sticky', 'truncate', 'italic', 'underline', 'uppercase', 'lowercase',
  'capitalize', 'antialiased',
]);

/** CSS identifier escaping, per CSSOM `CSS.escape`. */
export function escapeIdent(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const ch = value[i] as string;
    if (code === 0) out += '�';
    else if ((code >= 0x1 && code <= 0x1f) || code === 0x7f) out += `\\${code.toString(16)} `;
    else if (i === 0 && code >= 0x30 && code <= 0x39) out += `\\${code.toString(16)} `;
    else if (i === 1 && code >= 0x30 && code <= 0x39 && value.charCodeAt(0) === 0x2d)
      out += `\\${code.toString(16)} `;
    else if (i === 0 && code === 0x2d && value.length === 1) out += `\\${ch}`;
    else if (code >= 0x80 || ch === '-' || ch === '_' || /[a-zA-Z0-9]/.test(ch)) out += ch;
    else out += `\\${ch}`;
  }
  return out;
}

/** Double-quoted CSS string for an attribute selector value. */
export function quoteValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')}"`;
}

export function isUsableId(id: string): boolean {
  if (id === '' || /\s/.test(id)) return false;
  if (NUMERIC_ID.test(id)) return false;
  if (GENERATED_ID_PREFIX.test(id)) return false;
  return !HEX_RUN.test(id);
}

export function isUtilityClass(name: string): boolean {
  if (name.includes(':') || name.includes('[') || name.includes('/')) return true;
  return UTILITY_CLASS.test(name) || UTILITY_WORDS.has(name);
}

export function isStableClass(name: string): boolean {
  if (name === '' || name.length > 40) return false;
  if (UNSTABLE_CLASS.test(name)) return false;
  return !isUtilityClass(name);
}

export function stableClasses(el: Element): string[] {
  return classList(el).filter(isStableClass);
}

export function classList(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c !== '');
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

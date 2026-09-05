const TAG_ROLES: Record<string, string> = {
  button: 'button',
  nav: 'navigation',
  main: 'main',
  img: 'img',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  table: 'table',
  th: 'columnheader',
  td: 'cell',
  textarea: 'textbox',
  form: 'form',
  dialog: 'dialog',
  header: 'banner',
  footer: 'contentinfo',
  aside: 'complementary',
  article: 'article',
  option: 'option',
  progress: 'progressbar',
};

const INPUT_ROLES: Record<string, string> = {
  text: 'textbox',
  email: 'textbox',
  search: 'searchbox',
  tel: 'textbox',
  url: 'textbox',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  submit: 'button',
  reset: 'button',
  button: 'button',
  image: 'button',
};

/** Explicit `role`, else the implicit role of the tag. */
export function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role')?.trim();
  if (explicit) return explicit.split(/\s+/)[0] ?? null;

  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'input') return INPUT_ROLES[(el.getAttribute('type') ?? 'text').toLowerCase()] ?? null;
  if (tag === 'select') return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
  return TAG_ROLES[tag] ?? null;
}

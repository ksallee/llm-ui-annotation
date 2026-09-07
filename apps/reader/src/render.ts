import { Marked } from 'marked';

/** One rendered region: the epigraph, a `##` section, or the coda. */
export interface DocRegion {
  key: string;
  title: string;
  html: string;
}

export interface DocModel {
  title: string;
  titleHtml: string;
  epigraph: DocRegion | null;
  sections: DocRegion[];
  coda: DocRegion | null;
}

const BLOCK_TAG = /<(p|h[1-6]|li|blockquote|pre|td|th|dd|dt|figcaption)(\s|>)/g;
const FENCE = /^\s{0,3}(?:```|~~~)/;
const HR = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);

// The document is a local file, but a local file is not the same as a trusted one: a README from a
// dependency renders on the dev origin, which is the same origin as the annotation API. Raw HTML in
// markdown is shown as text rather than run.
const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html: ({ text }: { text: string }) => escapeHtml(text),
  },
});

/** URL-safe, deduplicated key for a heading. */
export function sectionKey(title: string, taken: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 's';
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  taken.add(key);
  return key;
}

/** Stamp `data-annot-block="<key>/<n>"` on every block-level tag, in document order. */
export function tagBlocks(html: string, key: string): string {
  let n = 0;
  return html.replace(
    BLOCK_TAG,
    (_all, tag: string, tail: string) => `<${tag} data-annot-block="${key}/${n++}"${tail}`,
  );
}

interface RawRegion {
  key: string;
  title: string;
  lines: string[];
}

function scan(markdown: string): { title: string; regions: RawRegion[] } {
  const taken = new Set<string>();
  const regions: RawRegion[] = [];
  let current: RawRegion = { key: 'epigraph', title: '', lines: [] };
  let title = '';
  let fenced = false;
  let coda = false;
  let previousBlank = true;

  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) fenced = !fenced;

    if (!fenced && !coda) {
      const h1 = /^#\s+(.*)$/.exec(line);
      if (h1 && title === '') {
        title = (h1[1] ?? '').trim();
        previousBlank = false;
        continue;
      }
      const h2 = /^##\s+(.*)$/.exec(line);
      if (h2) {
        if (current.lines.length > 0) regions.push(current);
        const heading = (h2[1] ?? '').trim();
        current = { key: sectionKey(heading, taken), title: heading, lines: [line] };
        previousBlank = false;
        continue;
      }
      if (HR.test(line) && previousBlank) {
        if (current.lines.length > 0) regions.push(current);
        current = { key: 'coda', title: '', lines: [] };
        coda = true;
        previousBlank = true;
        continue;
      }
    }

    current.lines.push(line);
    previousBlank = line.trim() === '';
  }
  if (current.lines.length > 0) regions.push(current);
  return { title, regions };
}

function render(region: RawRegion): DocRegion {
  const html = marked.parse(region.lines.join('\n').trim()) as string;
  return { key: region.key, title: region.title, html: tagBlocks(html, region.key) };
}

/** Parse one markdown document into the regions the reader lays out. */
export function renderDoc(markdown: string): DocModel {
  const { title, regions } = scan(markdown);
  const rendered = regions.map(render).filter((r) => r.html.trim() !== '');
  return {
    title,
    titleHtml: title === '' ? '' : tagBlocks(marked.parse(`# ${title}`) as string, 'title'),
    epigraph: rendered.find((r) => r.key === 'epigraph') ?? null,
    sections: rendered.filter((r) => r.key !== 'epigraph' && r.key !== 'coda'),
    coda: rendered.find((r) => r.key === 'coda') ?? null,
  };
}

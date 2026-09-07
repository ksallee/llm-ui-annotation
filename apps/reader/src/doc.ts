import { DOC_ENDPOINT, DOC_EVENT, DOC_META_ID, type DocMeta, type DocPayload } from './doc-protocol.js';

/** The subset of `import.meta.hot` the reader uses. */
export interface HotLike {
  on(event: string, handler: (payload: unknown) => void): void;
}

const FALLBACK: DocMeta = { path: '', name: 'document', route: '/doc' };

/** Read the metadata the dev plugin injected, so the route is known before any fetch. */
export function docMeta(doc: Document): DocMeta {
  const raw = doc.getElementById(DOC_META_ID)?.textContent;
  if (!raw) return FALLBACK;
  try {
    return { ...FALLBACK, ...(JSON.parse(raw) as Partial<DocMeta>) };
  } catch {
    return FALLBACK;
  }
}

export async function fetchDoc(): Promise<DocPayload> {
  const response = await fetch(DOC_ENDPOINT, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${DOC_ENDPOINT}: ${response.status}`);
  return (await response.json()) as DocPayload;
}

/** Call `onDoc` whenever the dev server pushes a new version of the document. */
export function watchDoc(hot: HotLike | undefined, onDoc: (doc: DocPayload) => void): void {
  hot?.on(DOC_EVENT, (payload) => {
    const doc = payload as DocPayload;
    if (typeof doc?.markdown === 'string') onDoc(doc);
  });
}

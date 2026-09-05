export const DOC_ENDPOINT = '/__doc';
export const DOC_EVENT = 'annot-reader:doc';
export const DOC_META_ID = 'reader-doc';

/** What the page knows about the document before it has fetched it. */
export interface DocMeta {
  path: string;
  name: string;
  route: string;
}

export interface DocPayload extends DocMeta {
  markdown: string;
}

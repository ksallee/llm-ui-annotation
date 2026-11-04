import type {
  Annotation,
  CreateBatchRequest,
  RouteFile,
  Status,
  Target,
} from '@llm-ui-annotation/core';
import { newId, nowIso } from '@llm-ui-annotation/core';

export const elementTarget = (selector = 'button.cta'): Target => ({
  kind: 'element',
  elements: [
    {
      selector,
      fallbacks: [],
      tag: 'button',
      role: 'button',
      name: 'Save',
      text: 'Save',
      rect: { x: 10, y: 20, width: 100, height: 40 },
      fixed: false,
      attrs: {},
    },
  ],
});

export function annotation(over: Partial<Annotation> = {}): Annotation {
  const at = nowIso();
  const id = over.id ?? newId();
  return {
    id,
    protocolVersion: 1,
    route: '/',
    url: 'http://localhost/',
    mode: 'element',
    target: elementTarget(),
    comment: 'do the thing',
    status: 'draft' as Status,
    thread: [{ id: newId(), role: 'user', kind: 'comment', text: 'do the thing', at }],
    batch: null,
    number: 1,
    viewport: { width: 800, height: 600, dpr: 1, scrollX: 0, scrollY: 0 },
    createdAt: at,
    updatedAt: at,
    sentAt: null,
    resolvedAt: null,
    approvedAt: null,
    resolution: null,
    ...over,
  };
}

export const routeFile = (annotations: Annotation[], route = '/'): RouteFile => ({
  route,
  updatedAt: nowIso(),
  nextNumber: annotations.length + 1,
  annotations,
});

/** An `AnnotClient` stand-in that records calls and echoes what it is given. */
export function fakeClient(): {
  calls: string[];
  create: (a: Annotation) => Promise<Annotation>;
  createBatch: (r: CreateBatchRequest) => Promise<unknown>;
  transition: (id: string, r: unknown) => Promise<Annotation>;
  patch: (id: string, comment: string) => Promise<Annotation>;
  remove: (id: string) => Promise<void>;
  batches: CreateBatchRequest[];
  store: Map<string, Annotation>;
} {
  const calls: string[] = [];
  const batches: CreateBatchRequest[] = [];
  const store = new Map<string, Annotation>();
  return {
    calls,
    batches,
    store,
    async create(a) {
      calls.push(`create:${a.id}`);
      const saved = { ...a, number: a.number || store.size + 1 };
      store.set(saved.id, saved);
      return saved;
    },
    async createBatch(request: CreateBatchRequest) {
      calls.push('batch');
      batches.push(request);
      return request;
    },
    async transition(id) {
      calls.push(`transition:${id}`);
      return store.get(id)!;
    },
    async patch(id, comment) {
      calls.push(`patch:${id}`);
      const next = { ...store.get(id)!, comment };
      store.set(id, next);
      return next;
    },
    async remove(id) {
      calls.push(`remove:${id}`);
      store.delete(id);
    },
  };
}

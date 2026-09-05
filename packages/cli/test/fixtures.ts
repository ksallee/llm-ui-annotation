import type { Annotation, Batch, ElementRef, Message, RouteFile } from '@llm-ui-annotation/core';
import { appendEvent, initDir, writeBatch, writeRoute } from '@llm-ui-annotation/core/node';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const IDS = {
  a: '01JBZZZZZZAAAAAAAAAAAAAAAA',
  b: '01JBZZZZZZBBBBBBBBBBBBBBBB',
  c: '01JBZZZZZZCCCCCCCCCCCCCCCC',
  home: '01JBZZZZZZDDDDDDDDDDDDDDDD',
  batch: '01JBZZZZZZ00000000000000B0',
} as const;

const AT = '2026-09-05T18:24:41.048Z';

export function elementRef(over: Partial<ElementRef> = {}): ElementRef {
  return {
    selector: 'main > section.pricing > article:nth-of-type(2) button',
    fallbacks: ['[data-testid=choose-pro]'],
    tag: 'button',
    role: 'button',
    name: 'Choose Pro',
    text: 'Choose Pro',
    rect: { x: 612, y: 940, width: 220, height: 44 },
    fixed: false,
    attrs: { class: 'cta' },
    styles: { 'font-size': '14px' },
    context: { parent: 'article "Pro"', prev: null, next: null },
    ...over,
  };
}

export function message(over: Partial<Message> = {}): Message {
  return { id: '01JBZZZZZZ0000000000000001', role: 'user', kind: 'comment', text: 'x', at: AT, ...over };
}

export function annotation(over: Partial<Annotation> = {}): Annotation {
  const comment = over.comment ?? 'Make this the same height as the Free button.';
  return {
    id: IDS.a,
    protocolVersion: 1,
    route: '/pricing',
    url: 'http://localhost:5173/pricing',
    mode: 'element',
    target: { kind: 'element', elements: [elementRef()] },
    comment,
    status: 'sent',
    thread: [message({ text: comment })],
    batch: IDS.batch,
    number: 4,
    viewport: { width: 1440, height: 900, dpr: 2, scrollX: 0, scrollY: 0 },
    createdAt: AT,
    updatedAt: AT,
    sentAt: AT,
    resolvedAt: null,
    approvedAt: null,
    resolution: null,
    ...over,
  };
}

export const PRICING: Annotation[] = [
  annotation(),
  annotation({
    id: IDS.b,
    number: 5,
    mode: 'text',
    comment: 'Typo: it should end with a period.',
    thread: [message({ text: 'Typo: it should end with a period.' })],
    target: {
      kind: 'text',
      container: elementRef({ selector: 'p.lede', tag: 'p', role: null, name: '', text: 'lede' }),
      quote: 'Cancel anytime, no questions asked',
      prefix: '…per seat. ',
      suffix: ' Upgrade or',
      start: 17,
      end: 51,
      rects: [{ x: 120, y: 320, width: 380, height: 22 }],
    },
  }),
  annotation({
    id: IDS.c,
    number: 6,
    mode: 'page',
    status: 'acknowledged',
    comment: 'The gaps are uneven.',
    thread: [message({ text: 'The gaps are uneven.' })],
    target: {
      kind: 'page',
      region: { x: 100, y: 200, width: 1180, height: 640 },
      strokes: [{ tool: 'arrow', from: [200, 300], to: [400, 420], color: '#f00', width: 4 }],
      screenshot: `screenshots/${IDS.c}.png`,
      elements: [elementRef({ selector: 'main > h2', tag: 'h2', name: 'Pricing', text: 'Pricing' })],
    },
  }),
];

export const HOME: Annotation[] = [
  annotation({
    id: IDS.home,
    route: '/',
    url: 'http://localhost:5173/',
    number: 4,
    status: 'approved',
    comment: 'Hero copy is too long.',
    thread: [message({ text: 'Hero copy is too long.' })],
    batch: null,
  }),
];

export const BATCH: Batch = {
  id: IDS.batch,
  route: '/pricing',
  annotationIds: [IDS.a, IDS.b, IDS.c],
  summary: 'all about the pricing table spacing.',
  sentAt: AT,
};

function routeFile(route: string, annotations: Annotation[]): RouteFile {
  return { route, updatedAt: AT, nextNumber: 7, annotations };
}

/** A temp project with `.annotations/` populated and one `batch.sent` event. */
export async function makeFixture(): Promise<{ root: string; dir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'annot-cli-'));
  const dir = join(root, '.annotations');
  await initDir(dir);
  await writeRoute(dir, routeFile('/pricing', PRICING));
  await writeRoute(dir, routeFile('/', HOME));
  await writeBatch(dir, BATCH);
  await appendEvent(dir, {
    at: AT,
    type: 'batch.sent',
    by: 'user',
    route: '/pricing',
    batchId: BATCH.id,
    data: BATCH,
  });
  return { root, dir };
}

export async function emptyProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'annot-proj-'));
}

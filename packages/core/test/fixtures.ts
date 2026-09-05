import { PROTOCOL_VERSION } from '../src/index.js';
import type {
  Annotation,
  Batch,
  ElementRef,
  Message,
  PageTarget,
  TextTarget,
  Viewport,
} from '../src/index.js';

export const VIEWPORT: Viewport = { width: 1440, height: 900, dpr: 2, scrollX: 0, scrollY: 0 };

export function elementRef(over: Partial<ElementRef> = {}): ElementRef {
  return {
    selector: 'main > section.pricing > article:nth-of-type(2) button',
    fallbacks: ['[data-testid=choose-pro]', 'button.cta'],
    tag: 'button',
    role: 'button',
    name: 'Choose Pro',
    text: 'Choose Pro',
    rect: { x: 612, y: 940, width: 220, height: 44 },
    fixed: false,
    attrs: { class: 'cta', 'data-testid': 'choose-pro' },
    styles: {
      'font-size': '14px',
      padding: '10px 18px',
      'background-color': 'oklch(0.55 0.15 250)',
    },
    context: { parent: 'article "Pro"', prev: 'p "$29 / month"', next: null },
    ...over,
  };
}

export const TEXT_TARGET: TextTarget = {
  kind: 'text',
  container: elementRef({
    selector: 'p.lede',
    fallbacks: ['main > p:nth-of-type(1)'],
    tag: 'p',
    role: null,
    name: '',
    text: 'Billed per seat. Cancel anytime, no questions asked Upgrade or downgrade at any time.',
    attrs: { class: 'lede' },
  }),
  quote: 'Cancel anytime, no questions asked',
  prefix: '…per seat. ',
  suffix: ' Upgrade or',
  start: 17,
  end: 51,
  rects: [{ x: 120, y: 320, width: 380, height: 22 }],
};

function blockRef(selector: string, tag: string, text: string): ElementRef {
  const ref = elementRef({ selector, tag, role: null, name: '', text, attrs: {} });
  delete ref.styles;
  delete ref.context;
  return ref;
}

export const TEXT_TARGET_MULTI: TextTarget = {
  ...TEXT_TARGET,
  container: elementRef({
    selector: 'section.terms',
    fallbacks: ['main > section:nth-of-type(2)'],
    tag: 'section',
    role: null,
    name: '',
    text: 'Billed per seat. Cancel anytime, no questions asked. Nobody will call you. Billing stops at the end of the period.',
    attrs: { class: 'terms' },
  }),
  quote: 'Cancel anytime, no questions asked. Nobody will call you. Billing stops at the end of the period.',
  prefix: 'Billed per seat. ',
  suffix: '',
  start: 17,
  end: 113,
  blocks: [
    blockRef('p.lede', 'p', 'Billed per seat. Cancel anytime, no questions asked.'),
    blockRef('blockquote.pull', 'blockquote', 'Nobody will call you.'),
    blockRef('section.terms > p:nth-of-type(2)', 'p', 'Billing stops at the end of the period.'),
  ],
};

export const PAGE_TARGET: PageTarget = {
  kind: 'page',
  region: { x: 100, y: 200, width: 1180, height: 640 },
  strokes: [
    {
      tool: 'brush',
      points: [
        [110, 210],
        [180, 260],
      ],
      color: 'oklch(0.65 0.2 30)',
      width: 4,
    },
    { tool: 'arrow', from: [200, 300], to: [400, 420], color: 'oklch(0.65 0.2 30)', width: 4 },
    { tool: 'label', at: [220, 320], text: 'gaps uneven here', color: 'oklch(0.65 0.2 30)', size: 14 },
  ],
  screenshot: 'screenshots/01JBZZZZZZZZZZZZZZZZZZZZZZ.png',
  elements: [
    elementRef({ selector: 'main > h2', tag: 'h2', role: 'heading', name: 'Pricing', text: 'Pricing' }),
    elementRef({ selector: 'section.pricing', tag: 'section', role: null, name: '', text: '' }),
    elementRef({ selector: 'article:nth-of-type(1)', tag: 'article', role: null, name: 'Free', text: 'Free' }),
  ],
};

export function message(over: Partial<Message> = {}): Message {
  return {
    id: '01JBZZZZZZ0000000000000001',
    role: 'user',
    kind: 'comment',
    text: 'Make this the same height as the Free button.',
    at: '2026-09-05T18:24:41.048Z',
    ...over,
  };
}

export function annotation(over: Partial<Annotation> = {}): Annotation {
  const comment = over.comment ?? 'Make this the same height as the Free button.';
  return {
    id: '01JBZZZZZZ0000000000000010',
    protocolVersion: PROTOCOL_VERSION,
    route: '/pricing',
    url: 'http://localhost:5173/pricing',
    mode: 'element',
    target: { kind: 'element', elements: [elementRef()] },
    comment,
    status: 'sent',
    thread: [message({ text: comment })],
    batch: '01JBZZZZZZ00000000000000B0',
    number: 4,
    viewport: VIEWPORT,
    createdAt: '2026-09-05T18:24:41.048Z',
    updatedAt: '2026-09-05T18:24:41.048Z',
    sentAt: '2026-09-05T18:25:00.000Z',
    resolvedAt: null,
    approvedAt: null,
    resolution: null,
    ...over,
  };
}

export const ELEMENT_ANNOTATION = annotation();

export const TEXT_ANNOTATION = annotation({
  id: '01JBZZZZZZ0000000000000011',
  mode: 'text',
  target: TEXT_TARGET,
  number: 5,
  comment: 'Typo: should be "no questions asked." with a period, and drop the comma before it.',
  thread: [
    message({
      id: '01JBZZZZZZ0000000000000002',
      text: 'Typo: should be "no questions asked." with a period, and drop the comma before it.',
    }),
  ],
});

export const PAGE_ANNOTATION = annotation({
  id: '01JBZZZZZZ0000000000000012',
  mode: 'page',
  target: PAGE_TARGET,
  number: 6,
  comment: 'The three cards should be visually one group, the gaps are uneven.',
  thread: [
    message({
      id: '01JBZZZZZZ0000000000000003',
      text: 'The three cards should be visually one group, the gaps are uneven.',
    }),
    message({
      id: '01JBZZZZZZ0000000000000004',
      role: 'agent',
      kind: 'question',
      text: 'Should the Free button also grow, or only Pro?',
      at: '2026-09-05T18:31:00.000Z',
    }),
  ],
});

export const TEXT_MULTI_ANNOTATION = annotation({
  id: '01JBZZZZZZ0000000000000013',
  mode: 'text',
  target: TEXT_TARGET_MULTI,
  number: 7,
  comment: 'This whole passage should be one bullet list.',
  thread: [
    message({
      id: '01JBZZZZZZ0000000000000005',
      text: 'This whole passage should be one bullet list.',
    }),
  ],
});

export const BATCH: Batch = {
  id: '01JBZZZZZZ00000000000000B0',
  route: '/pricing',
  annotationIds: [ELEMENT_ANNOTATION.id, TEXT_ANNOTATION.id, PAGE_ANNOTATION.id],
  summary: 'all of these are about the pricing table spacing.',
  sentAt: '2026-09-05T18:25:00.000Z',
};

export const ALL_ANNOTATIONS = [ELEMENT_ANNOTATION, TEXT_ANNOTATION, PAGE_ANNOTATION];

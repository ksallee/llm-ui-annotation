export const PROTOCOL_VERSION = 4;
/** Versions a reader accepts; v1 files have no `TextTarget.blocks`, v2 no `Annotation.styleEdits`, v1–3 may hold `page` targets. */
export const SUPPORTED_PROTOCOL_VERSIONS = [1, 2, 3, 4] as const;
export type ProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

export type Mode = 'element' | 'text';

export type Status = 'draft' | 'sent' | 'acknowledged' | 'question' | 'review' | 'approved';

export type Actor = 'user' | 'agent';

export const MODES: readonly Mode[] = ['element', 'text'];
export const STATUSES: readonly Status[] = [
  'draft',
  'sent',
  'acknowledged',
  'question',
  'review',
  'approved',
];
export const ACTORS: readonly Actor[] = ['user', 'agent'];

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
  scrollX: number;
  scrollY: number;
}

/** Document coordinates, CSS px. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Names of the neighbouring elements. */
export interface ElementContext {
  parent: string | null;
  prev: string | null;
  next: string | null;
}

/** One CSS declaration that reaches an element, as the source wrote it. */
export interface Declaration {
  property: string;
  value: string;
  /** The selector that set it, or `style` for an inline declaration. */
  from: string;
  /** The stylesheet it lives in, when the page says where that is. */
  file?: string;
  /** Set on an ancestor and inherited by this element. */
  inherited: boolean;
}

/** A place in the project's source, as a framework's dev build records it. */
export interface SourceLoc {
  file: string;
  line?: number;
  column?: number;
}

export interface ElementRef {
  /** `a >>> b` crosses an open shadow root. */
  selector: string;
  fallbacks: string[];
  tag: string;
  role: string | null;
  name: string;
  text: string;
  rect: Rect;
  /** Inside a position fixed/sticky ancestor. */
  fixed: boolean;
  attrs: Record<string, string>;
  /** Where the element was written, when the dev build says so. */
  source?: SourceLoc;
  /** What the page's stylesheets declare for it, as authored, with the rule each came from. */
  declared?: Declaration[];
  /** Omitted in compact payloads. */
  styles?: Record<string, string>;
  /** Property to the custom property that produced it; absent when none resolve. */
  tokens?: Record<string, string>;
  context?: ElementContext;
}

/** More than one element means the user multi-selected. */
export interface ElementTarget {
  kind: 'element';
  elements: ElementRef[];
}

export interface TextTarget {
  kind: 'text';
  container: ElementRef;
  quote: string;
  prefix: string;
  suffix: string;
  /** Char offset in the normalized container text. */
  start: number;
  end: number;
  rects: Rect[];
  /** Blocks the range spans, document order, compact; absent when it spans one. */
  blocks?: ElementRef[];
}

export type Target = ElementTarget | TextTarget;

export type MessageKind = 'comment' | 'question' | 'answer' | 'summary' | 'decline' | 'reopen';

export const MESSAGE_KINDS: readonly MessageKind[] = [
  'comment',
  'question',
  'answer',
  'summary',
  'decline',
  'reopen',
];

export interface Message {
  id: string;
  role: Actor;
  kind: MessageKind;
  text: string;
  at: string;
}

export type NewMessage = Omit<Message, 'id' | 'at'>;

export interface Resolution {
  kind: 'changed' | 'declined';
  summary: string;
}

export type AnchorState = 'exact' | 'moved' | 'lost';

/** A file dropped on an annotation. */
export interface Attachment {
  /** Names the file on disk. */
  id: string;
  /** Original filename, trimmed to 120 chars. */
  name: string;
  /** MIME, sniffed from the content, never taken from the client. */
  type: string;
  bytes: number;
  /** Relative to the annotations dir, e.g. `attachments/<annotationId>/<id>.png`. */
  path: string;
  at: string;
  by: Actor;
}

/** A value the user changed in the inspector. Proposed, never applied to the source by the overlay. */
export interface StyleEdit {
  /** The element it applies to, as an `ElementRef.selector` of the same annotation. */
  selector: string;
  property: string;
  /** The computed value before the edit. */
  from: string;
  to: string;
  /** The custom property `to` came from, when it was picked from the page's tokens. */
  token: string | null;
  /** The rule that declares the property today, and the file it lives in. */
  rule?: { selector: string; file?: string };
}

export interface Annotation {
  id: string;
  protocolVersion: ProtocolVersion;
  /** Pathname (+ search if the host opts in), the file key. */
  route: string;
  url: string;
  mode: Mode;
  target: Target;
  comment: string;
  status: Status;
  /** Chronological; the first entry duplicates `comment` as kind 'comment'. */
  thread: Message[];
  batch: string | null;
  /** Display number, per route, never reused. */
  number: number;
  viewport: Viewport;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  /** When the status became `review`. */
  resolvedAt: string | null;
  approvedAt: string | null;
  resolution: Resolution | null;
  attachments?: Attachment[];
  /** Values the user changed in the inspector, for the agent to put in the source. */
  styleEdits?: StyleEdit[];
  /** Browser-only, not persisted. */
  anchorState?: AnchorState;
}

/** How freely the agent may ask instead of deciding: 0 never, 3 whenever it would help. */
export type QuestionLevel = 0 | 1 | 2 | 3;

export const QUESTION_LEVELS: readonly QuestionLevel[] = [0, 1, 2, 3];

export interface Batch {
  id: string;
  route: string;
  annotationIds: string[];
  summary: string | null;
  sentAt: string;
  /** The user's question budget for this batch; absent means the agent decides for itself. */
  questions?: QuestionLevel;
}

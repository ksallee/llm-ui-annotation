export const PROTOCOL_VERSION = 1;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export type Mode = 'element' | 'text' | 'page';

export type Status = 'draft' | 'sent' | 'acknowledged' | 'question' | 'review' | 'approved';

export type Actor = 'user' | 'agent';

export const MODES: readonly Mode[] = ['element', 'text', 'page'];
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
  /** Omitted in compact payloads. */
  styles?: Record<string, string>;
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
}

/** Coordinates in document CSS px; color as drawn. */
export type Stroke =
  | { tool: 'brush'; points: [number, number][]; color: string; width: number }
  | { tool: 'arrow'; from: [number, number]; to: [number, number]; color: string; width: number }
  | { tool: 'rect'; rect: Rect; color: string; width: number }
  | { tool: 'ellipse'; rect: Rect; color: string; width: number }
  | { tool: 'label'; at: [number, number]; text: string; color: string; size: number };

export type StrokeTool = Stroke['tool'];

export interface PageTarget {
  kind: 'page';
  region: Rect;
  strokes: Stroke[];
  /** Path relative to the annotations dir; null if capture failed. */
  screenshot: string | null;
  elements: ElementRef[];
}

export type Target = ElementTarget | TextTarget | PageTarget;

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
  /** Browser-only, not persisted. */
  anchorState?: AnchorState;
}

export interface Batch {
  id: string;
  route: string;
  annotationIds: string[];
  summary: string | null;
  sentAt: string;
}

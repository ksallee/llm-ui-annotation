import {
  ACCEPTED_ATTACHMENT_TYPES,
  applyTransition,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TOTAL_MAX_BYTES,
  formatBytes,
  newId,
  nowIso,
  PROTOCOL_VERSION,
  summarizeTarget,
  type AnchorState,
  type Annotation,
  type Actor,
  type Attachment,
  type Event,
  type Message,
  type MessageKind,
  type Mode,
  type Rect,
  type RouteFile,
  type Status,
  type Stroke,
  type PageTarget,
  type Target,
  type TextTarget,
  type Viewport,
} from '@llm-ui-annotation/core';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
  anchorText,
  docRect,
  findElementsInRect,
  rangeRects,
  resolveSelector,
  strokeBounds,
  transformStrokes,
} from '../dom/core-dom.js';
import { routeOf, type DetailLevel, type MarkerVisibility, type SendMode } from '../options.js';
import { AnnotClient, AnnotHttpError } from '../transport/client.js';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './prefs.js';

export type Connection = 'connected' | 'polling' | 'offline';
export type Filter = 'needs-you' | 'open' | 'done' | 'all';
export type BulkAction = 'approve' | 'reopen' | 'send' | 'delete';

/** How a click on a row changes the selection. */
export type SelectHow = 'toggle' | 'range' | 'only';

/** Which statuses each bulk action may act on. */
export const BULK_ALLOWS: Record<BulkAction, (a: Annotation) => boolean> = {
  approve: (a) => a.status === 'review',
  reopen: (a) => a.status === 'review' || a.status === 'approved',
  send: (a) => a.status === 'draft' && a.comment.trim().length > 0,
  delete: (a) => a.status === 'draft',
};

export interface BulkOffer {
  /** Rows in the selection this action can act on. */
  count: number;
  /** Rows selected. */
  total: number;
  enabled: boolean;
}

export interface Anchor {
  rects: Rect[];
  state: AnchorState;
  range: Range | null;
}

export interface PopupState {
  mode: Mode;
  target: Target;
  anchor: Rect;
  comment: string;
  detail: boolean;
  editing: string | null;
  busy: boolean;
  /** The draft created early so a dropped file had somewhere to land. */
  draftId: string | null;
}

/** What a refused attachment says to the user, reason first. */
export function attachFailure(name: string, error: unknown): string {
  if (!(error instanceof AnnotHttpError)) return `Could not attach ${name}`;
  if (error.status === 415) {
    return `${name}: unsupported type — ${error.problems[0] ?? `accepted: ${ACCEPTED_ATTACHMENT_TYPES.join(', ')}`}`;
  }
  if (error.status === 413) {
    return `${name}: too large — ${formatBytes(ATTACHMENT_MAX_BYTES)} per file, ${formatBytes(ATTACHMENT_TOTAL_MAX_BYTES)} per annotation`;
  }
  if (error.status === 403) return `${name}: refused, uploads must come from this origin`;
  return `${name}: ${error.message}`;
}

export interface HoverState {
  el: Element | null;
  rect: Rect | null;
  label: string;
}

/** A drawing that is not an annotation yet. */
export interface PendingDrawing {
  id: string;
  strokes: Stroke[];
  undone: Stroke[];
  /** Set by the Frame tool; null while the box tracks the strokes. */
  region: Rect | null;
}

/** A drawing on the route, pending or already committed as an annotation. */
export interface DrawingRef {
  id: string;
  region: Rect;
  strokes: Stroke[];
  committed: boolean;
}

export type DrawTool = Stroke['tool'] | 'eraser' | 'move' | 'frame';

const EMPTY_DRAWING: { strokes: Stroke[]; undone: Stroke[] } = Object.freeze({
  strokes: Object.freeze([]) as unknown as Stroke[],
  undone: Object.freeze([]) as unknown as Stroke[],
});

export interface TextChip {
  rect: Rect;
  enabled: boolean;
  reason: string;
  target: TextTarget | null;
}

export interface LabelDraft {
  at: [number, number];
  text: string;
  /** The caption being retyped, rather than a new one. */
  edit?: { drawing: string; index: number };
}

export interface Toast {
  id: string;
  text: string;
  action: { label: string; run: () => void } | null;
}

export interface AnnotStateOptions {
  doc?: Document;
  client?: AnnotClient;
  route?: string;
  url?: string;
  sendMode?: SendMode;
  mode?: Mode;
  prefs?: Partial<Prefs>;
  persistPrefs?: boolean;
}

const OPEN: Status[] = ['draft', 'sent', 'acknowledged'];
const NEEDS_YOU: Status[] = ['question', 'review'];

/** What each panel filter keeps. The chips count with the predicate they filter by. */
export const FILTER_MATCHES: Record<Filter, (a: Annotation) => boolean> = {
  'needs-you': (a) => NEEDS_YOU.includes(a.status),
  open: (a) => OPEN.includes(a.status),
  done: (a) => a.status === 'approved',
  all: () => true,
};

/** Keeps a drawing's pin inside its region instead of centred on the corner. */
export const REGION_INSET = 14;

/** Everything the overlay renders from. One instance per mounted overlay. */
export class AnnotState {
  readonly annotations = new SvelteMap<string, Annotation>();
  readonly anchors = new SvelteMap<string, Anchor>();
  readonly optimistic = new Set<string>();

  route = $state('/');
  url = $state('');
  mode = $state<Mode | null>(null);
  connection = $state<Connection>('offline');
  seq = $state(0);
  nextNumber = $state(1);
  ready = $state(false);

  prefs = $state<Prefs>({ ...DEFAULT_PREFS });
  popup = $state<PopupState | null>(null);
  hover = $state<HoverState>({ el: null, rect: null, label: '' });
  selection = $state<Element[]>([]);
  marquee = $state<Rect | null>(null);
  drawings = $state<PendingDrawing[]>([]);
  activeDrawingId = $state<string | null>(null);
  insideDrawing = $state<string | null>(null);
  readonly hiddenDrawings = new SvelteSet<string>();
  readonly selectedDrawings = new SvelteSet<string>();
  readonly selectedStrokes = new SvelteSet<number>();
  regionElements = $state(0);
  drawTool = $state<DrawTool>('brush');
  /** Set by the overlay: the state has no DOM-to-canvas backend of its own. */
  captureFor: ((region: Rect, strokes: Stroke[]) => Promise<Blob | null>) | null = null;
  drawColor = $state('');
  drawWidth = $state(3);
  hoverCard = $state<string | null>(null);
  focusedId = $state<string | null>(null);
  panelFilter = $state<Filter>('open');
  panelFilterTouched = $state(false);
  allRoutes = $state(false);
  sendOpen = $state(false);
  settingsOpen = $state(false);
  shortcutsOpen = $state(false);
  frozen = $state(false);
  scroll = $state({ x: 0, y: 0 });
  toasts = $state<Toast[]>([]);
  palette = $state<string[]>([]);
  accentSuggestions = $state<string[]>([]);
  textChip = $state<TextChip | null>(null);
  labelDraft = $state<LabelDraft | null>(null);
  passthrough = $state(false);
  announcement = $state('');
  otherRouteDrafts = $state(0);
  paletteOpen = $state(false);
  /** A file drag is over the page while a mode is active. */
  pageDrop = $state(false);
  /** Annotations with an attachment upload in flight. */
  readonly attaching = new SvelteSet<string>();
  /** Settings is listening for the next chord; the controller must not act on it. */
  capturingKey = $state(false);
  readonly selected = new SvelteSet<string>();
  /** Object URLs for panel thumbnails, by annotation id. */
  readonly thumbnails = new SvelteMap<string, string>();
  #thumbnailsAsked = new Set<string>();
  #screenshotsServed: boolean | null = null;
  previewId = $state<string | null>(null);
  expandedId = $state<string | null>(null);
  #selectionAnchor: string | null = null;

  #hoverTimer = 0;
  #creating: Promise<string | null> | null = null;

  readonly doc: Document;
  readonly client: AnnotClient;
  #persist: boolean;

  constructor(options: AnnotStateOptions = {}) {
    this.doc = options.doc ?? globalThis.document;
    this.client = options.client ?? new AnnotClient();
    this.#persist = options.persistPrefs ?? true;
    this.prefs = { ...loadPrefs(this.doc), ...options.prefs };
    if (options.sendMode) this.prefs.sendMode = options.sendMode;
    this.url = options.url ?? this.doc?.defaultView?.location.href ?? '';
    this.route = options.route ?? routeOf(this.url);
    this.mode = options.mode ?? this.prefs.mode ?? null;
  }

  // ---------------------------------------------------------------- derived

  readonly list = $derived.by(() =>
    [...this.annotations.values()].sort((a, b) => a.number - b.number),
  );

  readonly onRoute = $derived.by(() => this.list.filter((a) => a.route === this.route));

  readonly visible = $derived.by(() => this.onRoute.filter((a) => a.status !== 'approved'));

  readonly drafts = $derived.by(() => this.onRoute.filter((a) => a.status === 'draft'));

  readonly needsYou = $derived.by(() => this.onRoute.filter((a) => NEEDS_YOU.includes(a.status)));

  readonly inReview = $derived.by(() => this.onRoute.filter((a) => a.status === 'review'));

  readonly counts = $derived.by(() => {
    const counts: Record<Status, number> = {
      draft: 0, sent: 0, acknowledged: 0, question: 0, review: 0, approved: 0,
    };
    for (const a of this.onRoute) counts[a.status]++;
    return counts;
  });

  readonly badge = $derived(
    this.prefs.sendMode === 'batch' && this.drafts.length > 0
      ? this.drafts.length
      : this.needsYou.length,
  );

  readonly inScope = $derived.by(() => (this.allRoutes ? this.list : this.onRoute));

  readonly filtered = $derived.by(() => this.inScope.filter(FILTER_MATCHES[this.panelFilter]));

  /** What each filter chip shows beside its label. */
  readonly filterCounts = $derived.by((): Record<Filter, number> => {
    const rows = this.inScope;
    return {
      'needs-you': rows.filter(FILTER_MATCHES['needs-you']).length,
      open: rows.filter(FILTER_MATCHES.open).length,
      done: rows.filter(FILTER_MATCHES.done).length,
      all: rows.length,
    };
  });

  readonly lost = $derived.by(() =>
    this.visible.filter((a) => this.anchors.get(a.id)?.state === 'lost'),
  );

  readonly selectedRows = $derived.by(() => this.filtered.filter((a) => this.selected.has(a.id)));

  readonly bulk = $derived.by((): Record<BulkAction, BulkOffer> => {
    const rows = this.selectedRows;
    // An action runs on the rows that allow it and says so, rather than going dead on a mixed
    // selection: "Approve (0), everything disabled" reads as broken, not as a rule.
    const offer = (allowed: (a: Annotation) => boolean): BulkOffer => {
      const count = rows.filter(allowed).length;
      return { count, total: rows.length, enabled: count > 0 };
    };
    return {
      approve: offer(BULK_ALLOWS.approve),
      reopen: offer(BULK_ALLOWS.reopen),
      send: offer(BULK_ALLOWS.send),
      delete: offer(BULK_ALLOWS.delete),
    };
  });

  // ------------------------------------------------------------- selection

  selectRow(id: string, how: SelectHow): void {
    if (how === 'range' && this.#selectionAnchor) {
      const ids = this.filtered.map((a) => a.id);
      const from = ids.indexOf(this.#selectionAnchor);
      const to = ids.indexOf(id);
      if (from >= 0 && to >= 0) {
        for (const between of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          this.selected.add(between);
        }
        this.announceSelection();
        return;
      }
    }
    if (how === 'only') this.selected.clear();
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.#selectionAnchor = id;
    this.announceSelection();
  }

  selectAllFiltered(): void {
    for (const a of this.filtered) this.selected.add(a.id);
    this.announceSelection();
  }

  clearSelection(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.#selectionAnchor = null;
  }

  announceSelection(): void {
    const n = this.selected.size;
    this.announce(n === 0 ? 'Selection cleared' : `${n} annotation${n === 1 ? '' : 's'} selected`);
  }

  /** Run one transition over the selection, with a single toast for the batch. */
  async runBulk(action: BulkAction): Promise<void> {
    if (!this.bulk[action].enabled) return;
    const allows = BULK_ALLOWS[action];
    const rows = this.selectedRows.filter(allows);
    if (rows.length === 0) return;
    this.clearSelection();
    if (action === 'approve') {
      for (const a of rows) await this.approve(a.id);
      this.batchToast(`Approved ${rows.length}`, () => {
        for (const a of rows) void this.reopen(a.id, 'undo approve');
      });
      return;
    }
    if (action === 'reopen') {
      for (const a of rows) await this.reopen(a.id, 'reopened from the panel');
      this.batchToast(`Reopened ${rows.length}`, null);
      return;
    }
    if (action === 'send') {
      for (const a of rows) await this.sendOne(a.id);
      this.batchToast(`Sent ${rows.length}`, null);
      return;
    }
    for (const a of rows) await this.deleteDraft(a.id);
    this.batchToast(`Deleted ${rows.length}`, null);
  }

  batchToast(text: string, undo: (() => void) | null): void {
    this.announce(text);
    this.toast(text, undo ? { label: 'Undo', run: undo } : null);
  }

  // ------------------------------------------------------------ preferences

  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.prefs = { ...this.prefs, [key]: value };
    if (this.#persist) savePrefs(this.prefs, this.doc);
  }

  get sendMode(): SendMode {
    return this.prefs.sendMode;
  }

  get detail(): DetailLevel {
    return this.prefs.detail;
  }

  get markerVisibility(): MarkerVisibility {
    return this.prefs.markers;
  }

  /** Open or close the panel, defaulting the filter to what needs the user. */
  /** Collapse the pill, closing every popover that hangs off it. */
  collapse(): void {
    this.setMode(null);
    this.paletteOpen = false;
    this.sendOpen = false;
    this.settingsOpen = false;
    this.shortcutsOpen = false;
    this.setPref('expanded', false);
  }

  togglePalette(open: boolean = !this.paletteOpen): void {
    this.paletteOpen = open;
  }

  togglePanel(open: boolean = !this.prefs.panelOpen): void {
    this.setPref('panelOpen', open);
    if (open && !this.panelFilterTouched) {
      this.panelFilter = this.needsYou.length > 0 ? 'needs-you' : 'open';
    }
  }

  setFilter(filter: Filter): void {
    if (filter !== this.panelFilter) this.clearSelection();
    this.panelFilter = filter;
    this.panelFilterTouched = true;
  }

  cycleMarkers(): void {
    const order: MarkerVisibility[] = ['all', 'dots', 'none'];
    const next = order[(order.indexOf(this.prefs.markers) + 1) % order.length]!;
    this.setPref('markers', next);
  }

  setMode(mode: Mode | null): void {
    const was = this.mode;
    this.mode = this.mode === mode ? null : mode;
    this.setPref('mode', this.mode);
    if (was === 'page' && this.mode !== 'page') {
      this.clearDrawSelection();
      void this.commitDrawings();
    }
    if (!this.mode) this.clearTransient();
  }

  clearTransient(): void {
    this.selection = [];
    this.marquee = null;
    this.hover = { el: null, rect: null, label: '' };
    this.textChip = null;
    this.labelDraft = null;
  }

  // ------------------------------------------------------------- reconciling

  hydrate(file: RouteFile): void {
    const keep = [...this.annotations.values()].filter(
      (a) => this.optimistic.has(a.id) && !file.annotations.some((s) => s.id === a.id),
    );
    for (const a of this.annotations.values()) {
      if (a.route === file.route) this.annotations.delete(a.id);
    }
    for (const a of file.annotations) this.annotations.set(a.id, a);
    for (const a of keep) this.annotations.set(a.id, a);
    this.nextNumber = Math.max(file.nextNumber, ...file.annotations.map((a) => a.number + 1), 1);
    this.ready = true;
  }

  /** The server's copy always wins. */
  applyServer(annotation: Annotation): void {
    this.optimistic.delete(annotation.id);
    this.annotations.set(annotation.id, annotation);
    this.nextNumber = Math.max(this.nextNumber, annotation.number + 1);
  }

  applyLocal(annotation: Annotation): void {
    this.annotations.set(annotation.id, annotation);
  }

  removeLocal(id: string): void {
    this.annotations.delete(id);
    this.anchors.delete(id);
    this.optimistic.delete(id);
    this.selected.delete(id);
  }

  receiveEvent(event: Event): void {
    this.seq = Math.max(this.seq, event.seq);
    if (event.type === 'annotation.deleted' && event.annotationId) {
      this.removeLocal(event.annotationId);
      return;
    }
    const data = event.data;
    if (data && 'status' in data) this.applyServer(data as Annotation);
    if (event.type === 'status.changed' && event.annotationId && event.status) {
      const current = this.annotations.get(event.annotationId);
      if (current && !data) {
        this.annotations.set(event.annotationId, { ...current, status: event.status });
      }
      this.announceStatus(event.annotationId, event.status);
    }
  }

  announceStatus(id: string, status: Status): void {
    const a = this.annotations.get(id);
    if (!a) return;
    if (status === 'question') this.announce(`Agent asked a question on #${a.number}`);
    if (status === 'review') this.announce(`#${a.number} ready for review`);
  }

  announce(text: string): void {
    this.announcement = text;
  }

  // ----------------------------------------------------------------- toasts

  toast(text: string, action: Toast['action'] = null, ms = 6000): void {
    const id = newId();
    this.toasts = [...this.toasts, { id, text, action }];
    this.doc?.defaultView?.setTimeout(() => this.dismissToast(id), ms);
  }

  dismissToast(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  // ------------------------------------------------------------ annotations

  viewport(): Viewport {
    const view = this.doc?.defaultView;
    return {
      width: view?.innerWidth ?? 0,
      height: view?.innerHeight ?? 0,
      dpr: view?.devicePixelRatio ?? 1,
      scrollX: view?.scrollX ?? 0,
      scrollY: view?.scrollY ?? 0,
    };
  }

  draft(mode: Mode, target: Target, comment: string, asDraft = false): Annotation {
    const at = nowIso();
    const id = newId();
    const immediate = this.prefs.sendMode === 'immediate' && !asDraft;
    return {
      id,
      protocolVersion: PROTOCOL_VERSION,
      route: this.route,
      url: this.url,
      mode,
      target,
      comment,
      status: immediate ? 'sent' : 'draft',
      thread: [{ id: newId(), role: 'user', kind: 'comment', text: comment, at }],
      batch: null,
      number: this.nextNumber,
      viewport: this.viewport(),
      createdAt: at,
      updatedAt: at,
      sentAt: immediate ? at : null,
      resolvedAt: null,
      approvedAt: null,
      resolution: null,
    };
  }

  /** Create an annotation, optimistically first, then reconcile with the server. */
  async add(mode: Mode, target: Target, comment: string, asDraft = false): Promise<Annotation> {
    const annotation = this.draft(mode, target, comment, asDraft);
    this.nextNumber++;
    this.optimistic.add(annotation.id);
    this.applyLocal(annotation);
    try {
      const saved = await this.client.create(annotation);
      this.applyServer(saved);
      if (saved.status === 'sent') {
        await this.client.createBatch({
          route: saved.route,
          annotationIds: [saved.id],
          summary: null,
        });
        this.announce('Sent 1 annotation');
      }
      return saved;
    } catch {
      this.connection = 'offline';
      this.toast('Dev server not reachable; kept in memory');
      return annotation;
    }
  }

  async editComment(id: string, comment: string): Promise<void> {
    const current = this.annotations.get(id);
    if (!current) return;
    this.applyLocal({ ...current, comment, updatedAt: nowIso() });
    try {
      this.applyServer(await this.client.patch(id, comment));
    } catch {
      this.connection = 'offline';
    }
  }

  async deleteDraft(id: string): Promise<void> {
    const current = this.annotations.get(id);
    if (!current || current.status !== 'draft') return;
    this.removeLocal(id);
    try {
      await this.client.remove(id);
    } catch {
      this.connection = 'offline';
    }
  }

  async move(id: string, to: Status, by: Actor, message?: { kind: MessageKind; text: string }): Promise<void> {
    const current = this.annotations.get(id);
    if (!current) return;
    const msg = message ? { role: by, kind: message.kind, text: message.text } : undefined;
    this.applyLocal(applyTransition(current, to, by, msg));
    try {
      const request = msg
        ? { to, by, message: { kind: msg.kind, text: msg.text, role: by } }
        : { to, by };
      this.applyServer(await this.client.transition(id, request));
    } catch {
      this.connection = 'offline';
    }
  }

  answer(id: string, text: string): Promise<void> {
    return this.move(id, 'acknowledged', 'user', { kind: 'answer', text });
  }

  approve(id: string): Promise<void> {
    return this.move(id, 'approved', 'user');
  }

  reopen(id: string, text: string): Promise<void> {
    return this.move(id, 'sent', 'user', { kind: 'reopen', text });
  }

  comment(id: string, text: string): Promise<void> {
    return this.move(id, 'sent', 'user', { kind: 'comment', text });
  }

  async approveAll(): Promise<void> {
    const ids = this.inReview.map((a) => a.id);
    const before = ids.map((id) => this.annotations.get(id)!);
    for (const id of ids) await this.approve(id);
    if (ids.length > 0) {
      this.announce(`Approved ${ids.length} annotations`);
      this.toast(`Approved ${ids.length}`, {
        label: 'Undo',
        run: () => {
          for (const a of before) void this.reopen(a.id, 'undo approve');
        },
      });
    }
  }

  showCard(id: string): void {
    this.doc?.defaultView?.clearTimeout(this.#hoverTimer);
    this.hoverCard = id;
  }

  hideCardSoon(): void {
    const view = this.doc?.defaultView;
    if (!view) {
      this.hoverCard = null;
      return;
    }
    view.clearTimeout(this.#hoverTimer);
    this.#hoverTimer = view.setTimeout(() => (this.hoverCard = null), 250);
  }

  /** Pull in the annotations of every other route, for the panel's all-routes view. */
  async toggleAllRoutes(open: boolean = !this.allRoutes): Promise<void> {
    this.clearSelection();
    this.allRoutes = open;
    if (!open) return;
    try {
      const { routes } = await this.client.routes();
      for (const route of routes) {
        if (route === this.route) continue;
        const file = await this.client.route(route);
        for (const a of file.annotations) if (!this.annotations.has(a.id)) this.annotations.set(a.id, a);
      }
    } catch {
      this.connection = 'offline';
    }
  }

  /** Open the send dialog and count the drafts waiting on other routes. */
  openSend(): void {
    this.sendOpen = true;
    void this.refreshOtherDrafts();
  }

  async refreshOtherDrafts(): Promise<void> {
    try {
      const { summaries } = await this.client.routes();
      this.otherRouteDrafts = (summaries ?? [])
        .filter((summary) => summary.route !== this.route)
        .reduce((total, summary) => total + (summary.counts.draft ?? 0), 0);
    } catch {
      this.otherRouteDrafts = 0;
    }
  }

  async sendDrafts(summary: string | null): Promise<void> {
    const ids = this.drafts.filter((a) => a.comment.trim()).map((a) => a.id);
    if (ids.length === 0) {
      if (this.draftsNeedingComment.length > 0) this.toast('Every draft needs a comment before sending');
      this.sendOpen = false;
      return;
    }
    for (const id of ids) {
      const current = this.annotations.get(id);
      if (current) this.applyLocal(applyTransition(current, 'sent', 'user'));
    }
    try {
      await this.client.createBatch({ route: this.route, annotationIds: ids, summary });
      this.toast('Sent. Waiting for the agent.');
      this.announce(`Sent ${ids.length} annotation${ids.length === 1 ? '' : 's'}`);
    } catch {
      this.connection = 'offline';
      this.toast('Could not reach the dev server');
    }
    this.sendOpen = false;
  }

  async sendOne(id: string): Promise<void> {
    const current = this.annotations.get(id);
    if (!current || current.status !== 'draft') return;
    if (!current.comment.trim()) {
      this.toast(`#${current.number} needs a comment before it can be sent`);
      return;
    }
    this.applyLocal(applyTransition(current, 'sent', 'user'));
    try {
      await this.client.createBatch({ route: current.route, annotationIds: [id], summary: null });
    } catch {
      this.connection = 'offline';
    }
  }

  // ----------------------------------------------------------- attachments

  /** Post files to an annotation, one toast per refusal. */
  async attach(id: string, files: readonly File[]): Promise<void> {
    for (const file of files) {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        this.toast(
          `${file.name}: too large — ${formatBytes(ATTACHMENT_MAX_BYTES)} per file, ${formatBytes(ATTACHMENT_TOTAL_MAX_BYTES)} per annotation`,
        );
        continue;
      }
      this.attaching.add(id);
      try {
        const attachment = await this.client.attach(id, file, file.name);
        this.mergeAttachment(id, attachment);
        this.announce(`Attached ${attachment.name}`);
      } catch (error) {
        if (!(error instanceof AnnotHttpError)) this.connection = 'offline';
        this.toast(attachFailure(file.name, error));
      } finally {
        this.attaching.delete(id);
      }
    }
  }

  mergeAttachment(id: string, attachment: Attachment): void {
    const current = this.annotations.get(id);
    if (!current) return;
    const rest = (current.attachments ?? []).filter((a) => a.id !== attachment.id);
    this.applyLocal({ ...current, attachments: [...rest, attachment] });
  }

  async detach(id: string, attachmentId: string): Promise<void> {
    const current = this.annotations.get(id);
    if (!current) return;
    this.applyLocal({
      ...current,
      attachments: (current.attachments ?? []).filter((a) => a.id !== attachmentId),
    });
    try {
      await this.client.detach(id, attachmentId);
    } catch {
      this.connection = 'offline';
      this.applyLocal(current);
    }
  }

  /** The id the popup writes into, created server-side on first need; null when that failed. */
  async popupAnnotation(): Promise<string | null> {
    const popup = this.popup;
    if (!popup) return null;
    if (popup.editing) return popup.editing;
    this.#creating ??= this.#createPopupDraft(popup);
    return this.#creating;
  }

  async #createPopupDraft(popup: PopupState): Promise<string | null> {
    // Always a draft, never an immediate send: the comment is still being typed. The empty thread
    // is what the commit's PATCH fills in, so the note ends up with one comment message, not two.
    const annotation: Annotation = {
      ...this.draft(popup.mode, popup.target, ''),
      status: 'draft',
      sentAt: null,
      thread: [],
    };
    this.nextNumber++;
    this.optimistic.add(annotation.id);
    this.applyLocal(annotation);
    popup.draftId = annotation.id;
    try {
      this.applyServer(await this.client.create(annotation));
    } catch {
      this.connection = 'offline';
      this.toast('Dev server not reachable; kept in memory');
      return null;
    }
    return annotation.id;
  }

  /** Finish a draft the popup created early: its comment, and the send when that is immediate. */
  async finishDraft(id: string, comment: string): Promise<Annotation> {
    await this.editComment(id, comment);
    if (this.prefs.sendMode === 'immediate') {
      await this.sendOne(id);
      this.announce('Sent 1 annotation');
    }
    return this.annotations.get(id)!;
  }

  // ---------------------------------------------------------------- anchors

  /** Re-resolve every visible annotation against the live DOM. */
  reanchor(): void {
    if (!this.doc) return;
    for (const a of this.visible) this.anchors.set(a.id, this.resolveAnchor(a));
    for (const id of [...this.anchors.keys()]) {
      const a = this.annotations.get(id);
      if (!a || a.status === 'approved') this.anchors.delete(id);
    }
  }

  resolveAnchor(a: Annotation): Anchor {
    const target = a.target;
    if (target.kind === 'element') {
      const rects: Rect[] = [];
      for (const ref of target.elements) {
        const el =
          resolveSelector(this.doc, ref.selector) ??
          ref.fallbacks.map((f) => resolveSelector(this.doc, f)).find(Boolean) ??
          null;
        if (el) rects.push(docRect(el));
      }
      if (rects.length === 0) return { rects: target.elements.map((e) => e.rect), state: 'lost', range: null };
      const state: AnchorState = rects.length === target.elements.length ? 'exact' : 'moved';
      return { rects, state, range: null };
    }
    if (target.kind === 'text') {
      const found = anchorText(this.doc, target);
      if (!found) return { rects: target.rects, state: 'lost', range: null };
      // `rangeRects` is what wrote `target.rects`; computing them any other way here made the
      // highlight change shape between creation and the first re-anchor.
      const rects = rangeRects(found.range);
      return { rects: rects.length > 0 ? rects : target.rects, state: found.state, range: found.range };
    }
    return { rects: [target.region], state: 'exact', range: null };
  }

  anchorOf(id: string): Anchor | null {
    return this.anchors.get(id) ?? null;
  }

  /** Fetch a drawing's screenshot once, for the panel thumbnail. */
  async loadThumbnail(id: string): Promise<void> {
    if (this.#thumbnailsAsked.has(id) || this.#screenshotsServed === false) return;
    this.#thumbnailsAsked.add(id);
    const target = this.annotations.get(id)?.target;
    if (target?.kind !== 'page' || !target.screenshot) return;
    const url = await this.client.screenshotUrl(id);
    // A first miss means the server does not serve them; asking again per row only fills the console.
    this.#screenshotsServed = url !== null;
    if (url) this.thumbnails.set(id, url);
  }

  /** Top-right of the first rect, in document coordinates; a drawing's pin sits inside its box. */
  markerPoint(id: string): { x: number; y: number } | null {
    const anchor = this.anchors.get(id);
    const a = this.annotations.get(id);
    if (!anchor || !a || anchor.rects.length === 0) return null;
    if (a.mode === 'text') {
      const last = anchor.rects.at(-1)!;
      return { x: last.x + last.width, y: last.y };
    }
    if (a.mode === 'page') {
      const first = anchor.rects[0]!;
      const inset = Math.min(REGION_INSET, first.width / 2, first.height / 2);
      return { x: first.x + inset, y: first.y + inset };
    }
    const first = anchor.rects[0]!;
    return { x: first.x + first.width, y: first.y };
  }

  // -------------------------------------------------------------- drawings

  /** Every drawing on screen for this route: the page annotations, then the pending ones. */
  readonly routeDrawings = $derived.by((): DrawingRef[] => {
    const refs: DrawingRef[] = [];
    for (const a of this.visible) {
      if (a.target.kind !== 'page' || this.hiddenDrawings.has(a.id)) continue;
      refs.push({
        id: a.id,
        region: this.anchors.get(a.id)?.rects[0] ?? a.target.region,
        strokes: a.target.strokes,
        committed: true,
      });
    }
    for (const d of this.drawings) {
      const region = d.region ?? (d.strokes.length > 0 ? strokeBounds(d.strokes) : null);
      if (region) refs.push({ id: d.id, region, strokes: d.strokes, committed: false });
    }
    return refs;
  });

  readonly draftsNeedingComment = $derived.by(() => this.drafts.filter((a) => !a.comment.trim()));

  get activeDrawing(): PendingDrawing | null {
    return this.drawings.find((d) => d.id === this.activeDrawingId) ?? null;
  }

  /** The active pending drawing, in the shape the drawing bar and the popup read. */
  get drawing(): { strokes: Stroke[]; undone: Stroke[] } {
    const active = this.activeDrawing;
    return active ? { strokes: active.strokes, undone: active.undone } : EMPTY_DRAWING;
  }

  set drawing(next: { strokes: Stroke[]; undone: Stroke[] }) {
    const id = this.activeDrawingId ?? this.newDrawing();
    this.#patch(id, { strokes: next.strokes, undone: next.undone });
  }

  #patch(id: string, patch: Partial<PendingDrawing>): void {
    this.drawings = this.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d));
  }

  #isPending(id: string): boolean {
    return this.drawings.some((d) => d.id === id);
  }

  newDrawing(strokes: Stroke[] = []): string {
    const id = newId();
    this.drawings = [...this.drawings, { id, strokes, undone: [], region: null }];
    this.activeDrawingId = id;
    return id;
  }

  dropDrawing(id: string | null): void {
    if (!id) return;
    this.drawings = this.drawings.filter((d) => d.id !== id);
    if (this.activeDrawingId === id) this.activeDrawingId = this.drawings.at(-1)?.id ?? null;
    this.selectedDrawings.delete(id);
    if (this.insideDrawing === id) {
      this.insideDrawing = null;
      this.selectedStrokes.clear();
    }
  }

  drawingRef(id: string | null): DrawingRef | null {
    return id ? (this.routeDrawings.find((d) => d.id === id) ?? null) : null;
  }

  strokesOf(id: string): Stroke[] {
    return this.drawingRef(id)?.strokes ?? [];
  }

  /** The smallest box holding the point, so a small drawing over a large one stays reachable. */
  drawingAt(x: number, y: number): DrawingRef | null {
    let best: DrawingRef | null = null;
    for (const d of this.routeDrawings) {
      const r = d.region;
      if (x < r.x || x > r.x + r.width || y < r.y || y > r.y + r.height) continue;
      if (!best || r.width * r.height < best.region.width * best.region.height) best = d;
    }
    return best;
  }

  /** The drawing a stroke starting at this point joins, or a new one. */
  drawingForPoint(x: number, y: number): string {
    const hit = this.drawingAt(x, y);
    if (!hit) return this.newDrawing();
    if (!hit.committed) this.activeDrawingId = hit.id;
    return hit.id;
  }

  setDrawingStrokes(id: string, strokes: Stroke[]): void {
    if (this.#isPending(id)) this.#patch(id, { strokes });
    else this.#setPageTarget(id, { strokes });
  }

  setDrawingRegion(id: string, region: Rect): void {
    if (this.#isPending(id)) this.#patch(id, { region });
    else this.#setPageTarget(id, { region });
  }

  #setPageTarget(id: string, patch: { region?: Rect; strokes?: Stroke[] }): void {
    const a = this.annotations.get(id);
    if (!a || a.target.kind !== 'page') return;
    const region = patch.region ?? a.target.region;
    const strokes = patch.strokes ?? a.target.strokes;
    const target: PageTarget = {
      ...a.target,
      region,
      strokes,
      elements: findElementsInRect(this.doc, region, { styles: false }),
    };
    this.applyLocal({ ...a, target, updatedAt: nowIso() });
    this.anchors.set(id, { rects: [region], state: 'exact', range: null });
  }

  /** Move or scale a whole drawing: marks and box together. */
  transformDrawing(id: string, from: Rect, to: Rect): void {
    const ref = this.drawingRef(id);
    if (!ref) return;
    const strokes = transformStrokes(ref.strokes, from, to);
    const pending = this.drawings.find((d) => d.id === id);
    if (!pending) {
      this.#setPageTarget(id, { region: to, strokes });
      return;
    }
    // Moving a box that still tracks its marks leaves it tracking; resizing pins it.
    const tracked = pending.region === null && to.width === from.width && to.height === from.height;
    this.#patch(id, { strokes, region: tracked ? null : to });
  }

  /** Shift a whole drawing, each by its own box, so a multi-drawing drag stays coherent. */
  moveDrawing(id: string, dx: number, dy: number): void {
    const ref = this.drawingRef(id);
    if (!ref) return;
    this.transformDrawing(id, ref.region, { ...ref.region, x: ref.region.x + dx, y: ref.region.y + dy });
  }

  /** Move or scale the picked strokes, leaving every other mark and the box where they are. */
  transformPickedStrokes(from: Rect, to: Rect): void {
    const id = this.insideDrawing;
    const ref = this.drawingRef(id);
    if (!id || !ref || this.selectedStrokes.size === 0) return;
    const moved = transformStrokes(
      ref.strokes.filter((_, i) => this.selectedStrokes.has(i)),
      from,
      to,
    );
    let n = 0;
    this.setDrawingStrokes(
      id,
      ref.strokes.map((stroke, i) => (this.selectedStrokes.has(i) ? (moved[n++] as Stroke) : stroke)),
    );
  }

  /** One stroke's box inside the drawing being edited. */
  strokeBoxAt(index: number): Rect | null {
    const stroke = this.drawingRef(this.insideDrawing)?.strokes[index];
    return stroke ? strokeBounds([stroke], 4) : null;
  }

  /** The box the picked strokes share, which is what their handles sit on. */
  get pickedStrokeBox(): Rect | null {
    const ref = this.drawingRef(this.insideDrawing);
    if (!ref || this.selectedStrokes.size === 0) return null;
    return strokeBounds(
      ref.strokes.filter((_, i) => this.selectedStrokes.has(i)),
      4,
    );
  }

  // ------------------------------------------------------- selecting drawings

  pickDrawing(id: string, additive = false): void {
    if (this.insideDrawing && this.insideDrawing !== id) this.insideDrawing = null;
    if (!additive) this.selectedDrawings.clear();
    if (additive && this.selectedDrawings.has(id)) this.selectedDrawings.delete(id);
    else this.selectedDrawings.add(id);
  }

  enterDrawing(id: string): void {
    this.insideDrawing = id;
    this.selectedDrawings.clear();
    this.selectedDrawings.add(id);
    this.selectedStrokes.clear();
  }

  pickStroke(index: number, additive = false): void {
    if (!additive) this.selectedStrokes.clear();
    if (additive && this.selectedStrokes.has(index)) this.selectedStrokes.delete(index);
    else this.selectedStrokes.add(index);
  }

  clearDrawSelection(): void {
    this.selectedDrawings.clear();
    this.selectedStrokes.clear();
    this.insideDrawing = null;
  }

  /** Esc walks out one level: inside → drawing selected → nothing selected. */
  stepOutDraw(): boolean {
    if (this.insideDrawing) {
      const id = this.insideDrawing;
      this.insideDrawing = null;
      this.selectedStrokes.clear();
      this.selectedDrawings.clear();
      this.selectedDrawings.add(id);
      return true;
    }
    if (this.selectedDrawings.size > 0) {
      this.selectedDrawings.clear();
      return true;
    }
    return false;
  }

  toggleHidden(id: string): void {
    if (this.hiddenDrawings.has(id)) this.hiddenDrawings.delete(id);
    else this.hiddenDrawings.add(id);
    if (this.hiddenDrawings.has(id)) {
      this.selectedDrawings.delete(id);
      if (this.insideDrawing === id) this.clearDrawSelection();
    }
  }

  // ------------------------------------------------------------- editing marks

  addStroke(id: string, stroke: Stroke): void {
    const pending = this.drawings.find((d) => d.id === id);
    if (pending) this.#patch(id, { strokes: [...pending.strokes, stroke], undone: [] });
    else this.#setPageTarget(id, { strokes: [...this.strokesOf(id), stroke] });
  }

  replaceStroke(id: string, index: number, stroke: Stroke): void {
    this.setDrawingStrokes(
      id,
      this.strokesOf(id).map((current, i) => (i === index ? stroke : current)),
    );
  }

  eraseStrokeOf(id: string, index: number): void {
    this.setDrawingStrokes(
      id,
      this.strokesOf(id).filter((_, i) => i !== index),
    );
    if (this.insideDrawing === id) this.selectedStrokes.clear();
  }

  pushStroke(stroke: Stroke): void {
    this.addStroke(this.activeDrawingId ?? this.newDrawing(), stroke);
  }

  undoStroke(): void {
    const active = this.activeDrawing;
    if (!active) return;
    const strokes = [...active.strokes];
    const last = strokes.pop();
    if (!last) return;
    this.#patch(active.id, { strokes, undone: [...active.undone, last] });
  }

  redoStroke(): void {
    const active = this.activeDrawing;
    if (!active) return;
    const undone = [...active.undone];
    const last = undone.pop();
    if (!last) return;
    this.#patch(active.id, { strokes: [...active.strokes, last], undone });
  }

  eraseStrokeAt(index: number): void {
    if (this.activeDrawingId) this.eraseStrokeOf(this.activeDrawingId, index);
  }

  clearDrawing(): void {
    this.dropDrawing(this.activeDrawingId);
  }

  /** The active pending drawing's box: the strokes' bounds until Frame sets one. */
  get drawingRegion(): Rect | null {
    return this.drawingRef(this.activeDrawingId)?.region ?? null;
  }

  get regionOverride(): Rect | null {
    return this.activeDrawing?.region ?? null;
  }

  setRegion(rect: Rect): void {
    if (this.activeDrawingId) this.setDrawingRegion(this.activeDrawingId, rect);
  }

  setStrokes(strokes: Stroke[]): void {
    if (this.activeDrawingId) this.setDrawingStrokes(this.activeDrawingId, strokes);
  }

  fitRegionToDrawing(): void {
    if (this.activeDrawingId) this.#patch(this.activeDrawingId, { region: null });
  }

  // ---------------------------------------------------------- committing marks

  /** Persist an edited drawing: a draft is re-posted, anything sent is PATCHed with a message. */
  async saveDrawing(id: string): Promise<void> {
    const a = this.annotations.get(id);
    if (!a || a.target.kind !== 'page') return;
    try {
      this.applyServer(
        a.status === 'draft'
          ? await this.client.create(a)
          : await this.client.patchTarget(id, a.target),
      );
    } catch {
      this.connection = 'offline';
    }
  }

  /** Leaving Draw turns every uncommitted drawing into a draft note with an empty comment. */
  async commitDrawings(): Promise<void> {
    const pending = this.drawings.filter((d) => d.strokes.length > 0);
    this.drawings = [];
    this.activeDrawingId = null;
    for (const d of pending) {
      const region = d.region ?? strokeBounds(d.strokes);
      const target: PageTarget = {
        kind: 'page',
        region,
        strokes: d.strokes,
        screenshot: null,
        elements: findElementsInRect(this.doc, region, { styles: false }),
      };
      const created = await this.add('page', target, '', true);
      await this.captureDrawing(created.id, region, d.strokes);
    }
    if (pending.length > 0) {
      this.announce(`Kept ${pending.length} drawing${pending.length === 1 ? '' : 's'} as a draft`);
    }
  }

  /** Store a screenshot for a committed drawing, when the overlay handed us a way to take one. */
  async captureDrawing(id: string, region: Rect, strokes: Stroke[]): Promise<void> {
    if (!this.captureFor) return;
    const png = await this.captureFor(region, strokes);
    if (!png) return;
    try {
      const { path } = await this.client.screenshot(id, png);
      const a = this.annotations.get(id);
      if (a && a.target.kind === 'page') {
        this.applyLocal({ ...a, target: { ...a.target, screenshot: path } });
      }
    } catch {
      // the panel falls back to drawing the strokes themselves
    }
  }

  // ----------------------------------------------------------------- popup

  openPopup(mode: Mode, target: Target, anchor: Rect, editing: string | null = null): void {
    const existing = editing ? this.annotations.get(editing) : null;
    this.popup = {
      mode,
      target,
      anchor,
      comment: existing?.comment ?? '',
      detail: false,
      editing,
      busy: false,
      draftId: null,
    };
    this.#creating = null;
  }

  /** Closing without committing takes the early draft, and its attachments, with it. */
  closePopup(): void {
    const abandoned = this.popup?.draftId ?? null;
    this.popup = null;
    this.#creating = null;
    if (abandoned) void this.deleteDraft(abandoned);
  }

  breadcrumb(target: Target): string {
    return summarizeTarget(target);
  }

  lastAgentMessage(a: Annotation): Message | null {
    return [...a.thread].reverse().find((m) => m.role === 'agent') ?? null;
  }
}

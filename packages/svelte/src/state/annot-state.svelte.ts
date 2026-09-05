import {
  applyTransition,
  newId,
  nowIso,
  PROTOCOL_VERSION,
  summarizeTarget,
  type AnchorState,
  type Annotation,
  type Actor,
  type Event,
  type Message,
  type MessageKind,
  type Mode,
  type Rect,
  type RouteFile,
  type Status,
  type Stroke,
  type Target,
  type TextTarget,
  type Viewport,
} from '@llm-ui-annotation/core';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { anchorText, docRect, resolveSelector, strokeBounds } from '../dom/core-dom.js';
import { routeOf, type DetailLevel, type MarkerVisibility, type SendMode } from '../options.js';
import { AnnotClient } from '../transport/client.js';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './prefs.js';

export type Connection = 'connected' | 'polling' | 'offline';
export type Filter = 'needs-you' | 'open' | 'done' | 'all';
export type BulkAction = 'approve' | 'reopen' | 'send' | 'delete';

/** How a click on a row changes the selection. */
export type SelectHow = 'toggle' | 'range' | 'only';

export interface BulkOffer {
  count: number;
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
}

export interface HoverState {
  el: Element | null;
  rect: Rect | null;
  label: string;
}

export interface PendingDrawing {
  strokes: Stroke[];
  undone: Stroke[];
}

export interface TextChip {
  rect: Rect;
  enabled: boolean;
  reason: string;
  target: TextTarget | null;
}

export interface LabelDraft {
  at: [number, number];
  text: string;
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
  drawing = $state<PendingDrawing>({ strokes: [], undone: [] });
  regionOverride = $state<Rect | null>(null);
  regionElements = $state(0);
  drawTool = $state<Stroke['tool'] | 'eraser'>('brush');
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
  /** Settings is listening for the next chord; the controller must not act on it. */
  capturingKey = $state(false);
  readonly selected = new SvelteSet<string>();
  previewId = $state<string | null>(null);
  expandedId = $state<string | null>(null);
  #selectionAnchor: string | null = null;

  #hoverTimer = 0;

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

  readonly filtered = $derived.by(() => {
    const rows = this.allRoutes ? this.list : this.onRoute;
    switch (this.panelFilter) {
      case 'needs-you':
        return rows.filter((a) => NEEDS_YOU.includes(a.status));
      case 'open':
        return rows.filter((a) => OPEN.includes(a.status));
      case 'done':
        return rows.filter((a) => a.status === 'approved');
      default:
        return rows;
    }
  });

  readonly lost = $derived.by(() =>
    this.visible.filter((a) => this.anchors.get(a.id)?.state === 'lost'),
  );

  readonly selectedRows = $derived.by(() => this.filtered.filter((a) => this.selected.has(a.id)));

  readonly bulk = $derived.by((): Record<BulkAction, BulkOffer> => {
    const rows = this.selectedRows;
    const offer = (allowed: (a: Annotation) => boolean): BulkOffer => {
      const count = rows.filter(allowed).length;
      return { count, enabled: count > 0 && count === rows.length };
    };
    return {
      approve: offer((a) => a.status === 'review'),
      reopen: offer((a) => a.status === 'review' || a.status === 'approved'),
      send: offer((a) => a.status === 'draft'),
      delete: offer((a) => a.status === 'draft'),
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
    const rows = [...this.selectedRows];
    if (rows.length === 0 || !this.bulk[action].enabled) return;
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
    this.mode = this.mode === mode ? null : mode;
    this.setPref('mode', this.mode);
    if (!this.mode) this.clearTransient();
  }

  clearTransient(): void {
    this.selection = [];
    this.marquee = null;
    this.hover = { el: null, rect: null, label: '' };
    this.drawing = { strokes: [], undone: [] };
    this.regionOverride = null;
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

  draft(mode: Mode, target: Target, comment: string): Annotation {
    const at = nowIso();
    const id = newId();
    const immediate = this.prefs.sendMode === 'immediate';
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
  async add(mode: Mode, target: Target, comment: string): Promise<Annotation> {
    const annotation = this.draft(mode, target, comment);
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
    const ids = this.drafts.map((a) => a.id);
    if (ids.length === 0) return;
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
    this.applyLocal(applyTransition(current, 'sent', 'user'));
    try {
      await this.client.createBatch({ route: current.route, annotationIds: [id], summary: null });
    } catch {
      this.connection = 'offline';
    }
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
      const view = this.doc.defaultView;
      const sx = view?.scrollX ?? 0;
      const sy = view?.scrollY ?? 0;
      const rects = [...found.range.getClientRects()]
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          x: Math.round(r.left + sx),
          y: Math.round(r.top + sy),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }));
      return { rects: rects.length > 0 ? rects : target.rects, state: found.state, range: found.range };
    }
    return { rects: [target.region], state: 'exact', range: null };
  }

  anchorOf(id: string): Anchor | null {
    return this.anchors.get(id) ?? null;
  }

  /** Top-right of the first rect, in document coordinates. */
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
      return { x: first.x, y: first.y };
    }
    const first = anchor.rects[0]!;
    return { x: first.x + first.width, y: first.y };
  }

  // --------------------------------------------------------------- drawing

  pushStroke(stroke: Stroke): void {
    this.drawing = { strokes: [...this.drawing.strokes, stroke], undone: [] };
  }

  undoStroke(): void {
    const strokes = [...this.drawing.strokes];
    const last = strokes.pop();
    if (!last) return;
    this.drawing = { strokes, undone: [...this.drawing.undone, last] };
  }

  redoStroke(): void {
    const undone = [...this.drawing.undone];
    const last = undone.pop();
    if (!last) return;
    this.drawing = { strokes: [...this.drawing.strokes, last], undone };
  }

  eraseStrokeAt(index: number): void {
    this.drawing = {
      strokes: this.drawing.strokes.filter((_, i) => i !== index),
      undone: this.drawing.undone,
    };
  }

  clearDrawing(): void {
    this.drawing = { strokes: [], undone: [] };
    this.regionOverride = null;
  }

  /** The dashed box: the strokes' bounds until the user drags it, then whatever they set. */
  get drawingRegion(): Rect | null {
    if (this.regionOverride) return this.regionOverride;
    return this.drawing.strokes.length > 0 ? strokeBounds(this.drawing.strokes) : null;
  }

  setRegion(rect: Rect): void {
    this.regionOverride = rect;
  }

  fitRegionToDrawing(): void {
    this.regionOverride = null;
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
    };
  }

  closePopup(): void {
    this.popup = null;
  }

  breadcrumb(target: Target): string {
    return summarizeTarget(target);
  }

  lastAgentMessage(a: Annotation): Message | null {
    return [...a.thread].reverse().find((m) => m.role === 'agent') ?? null;
  }
}

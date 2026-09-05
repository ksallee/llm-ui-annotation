import {
  applyTransition,
  newId,
  nowIso,
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
import { SvelteMap } from 'svelte/reactivity';
import { anchorText, docRect, resolveSelector, strokeBounds } from '../dom/core-dom.js';
import { routeOf, type DetailLevel, type MarkerVisibility, type SendMode } from '../options.js';
import { AnnotClient } from '../transport/client.js';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './prefs.js';

export type Connection = 'connected' | 'polling' | 'offline';
export type Filter = 'needs-you' | 'open' | 'done' | 'all';

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
  togglePanel(open: boolean = !this.prefs.panelOpen): void {
    this.setPref('panelOpen', open);
    if (open && !this.panelFilterTouched) {
      this.panelFilter = this.needsYou.length > 0 ? 'needs-you' : 'open';
    }
  }

  setFilter(filter: Filter): void {
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
      protocolVersion: 1,
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
  }

  get drawingRegion(): Rect | null {
    return this.drawing.strokes.length > 0 ? strokeBounds(this.drawing.strokes) : null;
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

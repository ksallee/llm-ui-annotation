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
  type StyleEdit,
  type Target,
  type TextTarget,
  type Viewport,
} from '@llm-ui-annotation/core';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
  anchorText,
  docRect,
  rangeRects,
  resolveSelector,
} from '../dom/core-dom.js';
import { routeOf, type DetailLevel, type MarkerVisibility, type SendMode } from '../options.js';
import { AnnotClient, AnnotHttpError } from '../transport/client.js';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './prefs.js';

export type Connection = 'connected' | 'polling' | 'offline';
export type Filter = 'needs-you' | 'open' | 'done' | 'all';
/** The drawer's two channels. */
export type Channel = 'notes' | 'inspect';
export type BulkAction = 'approve' | 'reopen' | 'send' | 'delete';

/** How a click on a row changes the selection. */
export type SelectHow = 'toggle' | 'range' | 'only';

/** Which statuses each bulk action may act on. */
const BULK_ALLOWS: Record<BulkAction, (a: Annotation) => boolean> = {
  approve: (a) => a.status === 'review',
  reopen: (a) => (a.status === 'review' || a.status === 'approved') && a.kind !== 'replace',
  send: (a) => a.status === 'draft' && a.comment.trim().length > 0,
  // `.annotations/` is a scratch directory, not an audit log: a note sent by mistake has to go.
  delete: () => true,
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
  /** The selection a text note is about, painted while the note is open. */
  range: Range | null;
  /** The text that will take the quote's place; null while writing a note. */
  replacing: string | null;
  /** Why the server refused the replacement. */
  error: string | null;
}

const tooLarge = (name: string): string =>
  `${name}: too large — ${formatBytes(ATTACHMENT_MAX_BYTES)} per file, ${formatBytes(ATTACHMENT_TOTAL_MAX_BYTES)} per annotation`;

/** What a refused attachment says to the user, reason first. */
function attachFailure(name: string, error: unknown): string {
  if (!(error instanceof AnnotHttpError)) return `Could not attach ${name}`;
  if (error.status === 415) {
    return `${name}: unsupported type — ${error.problems[0] ?? `accepted: ${ACCEPTED_ATTACHMENT_TYPES.join(', ')}`}`;
  }
  if (error.status === 413) return tooLarge(name);
  if (error.status === 403) return `${name}: refused, uploads must come from this origin`;
  return `${name}: ${error.message}`;
}

export interface HoverState {
  el: Element | null;
  rect: Rect | null;
  label: string;
}

export interface TextChip {
  rect: Rect;
  enabled: boolean;
  reason: string;
  target: TextTarget | null;
  range: Range | null;
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
const FILTER_MATCHES: Record<Filter, (a: Annotation) => boolean> = {
  'needs-you': (a) => NEEDS_YOU.includes(a.status),
  open: (a) => OPEN.includes(a.status),
  done: (a) => a.status === 'approved',
  all: () => true,
};

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
  /** The dev server can write a text replacement into this page's source. */
  canReplace = $state(false);

  prefs = $state<Prefs>({ ...DEFAULT_PREFS });
  popup = $state<PopupState | null>(null);
  hover = $state<HoverState>({ el: null, rect: null, label: '' });
  #selection = $state<Element[]>([]);
  /** Held by the channel toggle until the selection changes. */
  channelPin = $state<Channel | null>(null);
  marquee = $state<Rect | null>(null);
  /** Values changed in the inspector, waiting to ride with the next note. */
  styleEdits = $state<StyleEdit[]>([]);
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
  accentSuggestions = $state<string[]>([]);
  textChip = $state<TextChip | null>(null);
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

  // ------------------------------------------------------- element selection

  get selection(): Element[] {
    return this.#selection;
  }

  /** A changed selection releases the channel toggle, so the next pick reads as a new subject. */
  set selection(next: Element[]) {
    const same =
      next.length === this.#selection.length && next.every((el, i) => el === this.#selection[i]);
    this.#selection = next;
    if (!same) this.channelPin = null;
  }

  // ------------------------------------------------------------ style edits

  styleEdit(selector: string, property: string): StyleEdit | undefined {
    return this.styleEdits.find((e) => e.selector === selector && e.property === property);
  }

  /** Record one changed value, or drop it when it is back to what the page already had. */
  setStyleEdit(edit: StyleEdit): void {
    const rest = this.styleEdits.filter(
      (e) => e.selector !== edit.selector || e.property !== edit.property,
    );
    this.styleEdits = edit.to.trim() === '' ? rest : [...rest, edit];
  }

  dropStyleEdit(selector: string, property: string): void {
    this.styleEdits = this.styleEdits.filter(
      (e) => e.selector !== selector || e.property !== property,
    );
  }

  clearStyleEdits(): void {
    this.styleEdits = [];
  }


  /** The element the inspector reads. */
  readonly inspected = $derived(this.mode === 'element' ? (this.selection[0] ?? null) : null);

  /** Selecting an element switches an open drawer to Inspect; it never opens a closed one. */
  readonly channel = $derived<Channel>(this.channelPin ?? (this.inspected ? 'inspect' : 'notes'));

  /**
   * Whether pointing at the page still outlines what is under the cursor. Selecting an element with
   * the drawer open turns it off, the way devtools leaves its picker after a pick.
   */
  picking = $state(true);

  /**
   * Reading an element rather than annotating it. True with the drawer open on anything but Notes,
   * including before the first selection, so a click behaves the same way every time.
   */
  readonly inspecting = $derived(this.prefs.panelOpen && this.channelPin !== 'notes');

  setChannel(channel: Channel): void {
    this.channelPin = channel;
  }

  // ---------------------------------------------------------------- derived

  readonly list = $derived.by(() =>
    [...this.annotations.values()].sort((a, b) => a.number - b.number),
  );

  readonly onRoute = $derived.by(() => this.list.filter((a) => a.route === this.route));

  readonly visible = $derived.by(() => this.onRoute.filter((a) => a.status !== 'approved'));

  readonly drafts = $derived.by(() => this.onRoute.filter((a) => a.status === 'draft'));

  readonly draftsNeedingComment = $derived.by(() => this.drafts.filter((a) => !a.comment.trim()));

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
    this.prefs.sendMode === 'manual' && this.drafts.length > 0
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
    for (const a of rows) await this.deleteNote(a.id);
    this.batchToast(`Deleted ${rows.length}`, null);
  }

  /**
   * Why a write did not land. A refusal is not silence: the server answered, and saying it is
   * unreachable sends the user to look at the wrong thing.
   */
  writeFailed(what: string, error: unknown): void {
    if (error instanceof AnnotHttpError) {
      this.toast(`${what} refused: ${error.problems[0] ?? error.message}`);
      return;
    }
    this.connection = 'offline';
    this.toast('Dev server not reachable; kept in memory');
  }

  /** One note has gone out. The pin turning solid is easy to miss; this is not. */
  noteSent(): void {
    this.announce('Sent 1 annotation');
    this.toast('Sent. Waiting for the agent.');
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

  /** Both automatic modes send a note the moment it is written. */
  readonly autoSends = $derived(this.prefs.sendMode !== 'manual');

  get detail(): DetailLevel {
    return this.prefs.detail;
  }

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

  /** Open or close the panel, defaulting the filter to what needs the user. */
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
    if (this.mode !== was) this.channelPin = null;
    this.setPref('mode', this.mode);
    if (this.mode === 'element') this.picking = true;
    if (!this.mode) this.clearTransient();
  }

  clearTransient(): void {
    this.selection = [];
    this.marquee = null;
    this.hover = { el: null, rect: null, label: '' };
    this.textChip = null;
    // Leaving the mode is closing the proposal: the preview goes with it.
    this.clearStyleEdits();
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
    const before = this.annotations.get(annotation.id)?.status;
    this.optimistic.delete(annotation.id);
    this.annotations.set(annotation.id, annotation);
    this.nextNumber = Math.max(this.nextNumber, annotation.number + 1);
    // `auto` means the user is not reviewing: the agent saying it is done is the end of it.
    if (this.prefs.sendMode === 'auto' && annotation.status === 'review' && before !== 'review') {
      void this.approve(annotation.id);
    }
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
    const immediate = this.autoSends && !asDraft;
    return {
      id,
      protocolVersion: PROTOCOL_VERSION,
      route: this.route,
      url: this.url,
      mode,
      target,
      comment,
      status: immediate ? 'sent' : 'draft',
      // A note made early for a dropped file has no words yet, and its first words arrive as an
      // edit. An empty opening entry would be a blank line in the thread the agent reads.
      thread: comment ? [{ id: newId(), role: 'user', kind: 'comment', text: comment, at }] : [],
      batch: null,
      number: this.nextNumber,
      viewport: this.viewport(),
      ...(this.styleEdits.length > 0 ? { styleEdits: [...this.styleEdits] } : {}),
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
          questions: this.prefs.questions,
        });
        this.noteSent();
      }
      return saved;
    } catch (error) {
      this.writeFailed('The note was', error);
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

  async deleteNote(id: string): Promise<void> {
    const current = this.annotations.get(id);
    if (!current) return;
    this.removeLocal(id);
    try {
      await this.client.remove(id);
    } catch {
      this.connection = 'offline';
    }
  }

  /** Delete from a user gesture. No confirmation; the toast names what went. */
  async deleteRow(id: string): Promise<void> {
    const current = this.annotations.get(id);
    if (!current) return;
    await this.deleteNote(id);
    this.announce(`Deleted annotation ${current.number}`);
    this.toast(`Deleted #${current.number}`, null);
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
      await this.client.createBatch({
        route: this.route,
        annotationIds: ids,
        summary,
        questions: this.prefs.questions,
      });
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
      await this.client.createBatch({
        route: current.route,
        annotationIds: [id],
        summary: null,
        questions: this.prefs.questions,
      });
    } catch {
      this.connection = 'offline';
    }
  }

  // ----------------------------------------------------------- attachments

  /** Post files to an annotation, one toast per refusal. */
  async attach(id: string, files: readonly File[]): Promise<void> {
    for (const file of files) {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        this.toast(tooLarge(file.name));
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
    if (this.autoSends) {
      await this.sendOne(id);
      this.noteSent();
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
    const found = anchorText(this.doc, target);
    if (!found) return { rects: target.rects, state: 'lost', range: null };
    // `rangeRects` is what wrote `target.rects`; any other measure changes the highlight's shape
    // between creation and the first re-anchor.
    const rects = rangeRects(found.range);
    return { rects: rects.length > 0 ? rects : target.rects, state: found.state, range: found.range };
  }

  anchorOf(id: string): Anchor | null {
    return this.anchors.get(id) ?? null;
  }

  /** Top-right of the first rect, in document coordinates; the end of the last line for text. */
  markerPoint(id: string): { x: number; y: number } | null {
    const anchor = this.anchors.get(id);
    const a = this.annotations.get(id);
    if (!anchor || !a || anchor.rects.length === 0) return null;
    if (a.mode === 'text') {
      const last = anchor.rects.at(-1)!;
      return { x: last.x + last.width, y: last.y };
    }
    const first = anchor.rects[0]!;
    return { x: first.x + first.width, y: first.y };
  }

  // ----------------------------------------------------------------- popup

  openPopup(
    mode: Mode,
    target: Target,
    anchor: Rect,
    editing: string | null = null,
    range: Range | null = null,
  ): void {
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
      range,
      replacing: null,
      error: null,
    };
    this.#creating = null;
  }

  /** Swap the note for a field holding the selected text, to be rewritten in the source. */
  startReplace(): void {
    const popup = this.popup;
    if (!popup || popup.target.kind !== 'text' || !this.canReplace) return;
    popup.replacing = popup.target.quote;
    popup.error = null;
  }

  /** Back from the replacement field to the note. */
  cancelReplace(): void {
    if (!this.popup) return;
    this.popup.replacing = null;
    this.popup.error = null;
  }

  /** Have the dev server write the replacement into the source; the popup stays open on a refusal. */
  async confirmReplace(): Promise<void> {
    const popup = this.popup;
    if (!popup || popup.busy || popup.replacing === null || popup.target.kind !== 'text') return;
    if (popup.replacing === popup.target.quote) return;
    popup.busy = true;
    popup.error = null;
    try {
      const saved = await this.client.replace({
        route: this.route,
        url: this.url,
        target: popup.target,
        replacement: popup.replacing,
        viewport: this.viewport(),
      });
      this.applyServer(saved);
      this.announce('Replaced in the source');
      this.toast(`Replaced in ${saved.replacement?.file.split('/').at(-1) ?? 'the source'}`);
      this.textChip = null;
      this.doc.getSelection()?.removeAllRanges();
      this.closePopup();
    } catch (error) {
      popup.error =
        error instanceof AnnotHttpError ? error.message : 'Dev server not reachable; nothing was written';
    } finally {
      popup.busy = false;
    }
  }

  /** Closing without committing takes the early draft, and its attachments, with it. */
  closePopup(): void {
    const abandoned = this.popup?.draftId ?? null;
    this.popup = null;
    this.#creating = null;
    if (abandoned) void this.deleteNote(abandoned);
  }

  breadcrumb(target: Target): string {
    return summarizeTarget(target);
  }

  lastAgentMessage(a: Annotation): Message | null {
    return [...a.thread].reverse().find((m) => m.role === 'agent') ?? null;
  }
}

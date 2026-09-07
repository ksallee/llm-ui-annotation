<script lang="ts">
  import css from '../styles/overlay.css?raw';
  import {
    bindKeys,
    capturePage,
    clearStylePreview,
    commitPopup,
    freezeWhile,
    holdScroll,
    locate,
    LOCATE_KEY,
    paintTextHighlights,
    previewStyleEdits,
    primaryAction,
    watchPageDrops,
    watchViewport,
  } from '../controller.js';
  import { clearHighlights, ensureHighlightStyle, supportsHighlights } from '../dom/highlights.js';
  import {
    commitLabel,
    elementMode,
    openElementPopup,
    openPagePopup,
    openTextPopup,
    pageMode,
    textMode,
  } from '../modes/index.js';
  import { createState } from '../create.js';
  import type { AnnotatorProps, OverlayOptions } from '../options.js';
  import { connectLive } from '../transport/live.js';
  import { VERSION } from '../version.js';
  import { accentSuggestions, applyTheme, drawingPalette } from '../theme/index.js';
  import DrawBar from './DrawBar.svelte';
  import ElementCard from './ElementCard.svelte';
  import Highlights from './Highlights.svelte';
  import HoverCard from './HoverCard.svelte';
  import Markers from './Markers.svelte';
  import Palette from './Palette.svelte';
  import Panel from './Panel.svelte';
  import Popup from './Popup.svelte';
  import Region from './Region.svelte';
  import SendDialog from './SendDialog.svelte';
  import Settings from './Settings.svelte';
  import Shortcuts from './Shortcuts.svelte';
  import Toasts from './Toasts.svelte';
  import Toolbar from './Toolbar.svelte';

  let {
    state: given,
    options = {},
    version = VERSION,
    accent,
    scheme,
    sendMode,
    routeKey,
    basePath,
    mode,
  }: AnnotatorProps = $props();

  // svelte-ignore state_referenced_locally
  const merged: OverlayOptions = {
    ...options,
    ...(accent ? { accent } : {}),
    ...(scheme ? { scheme } : {}),
    ...(sendMode ? { sendMode } : {}),
    ...(routeKey ? { routeKey } : {}),
    ...(basePath ? { basePath } : {}),
    ...(mode ? { mode } : {}),
  };

  // svelte-ignore state_referenced_locally
  const annot = given ?? createState(merged);

  let root = $state<HTMLElement | null>(null);
  let capture = $state<HTMLElement | null>(null);
  let labelInput = $state<HTMLInputElement | null>(null);

  const host = $derived.by(() => {
    const node = root?.getRootNode();
    return node instanceof ShadowRoot ? (node.host as HTMLElement) : root;
  });
  const painted = $derived(supportsHighlights(annot.doc));
  const hovered = $derived(annot.hoverCard ? annot.annotations.get(annot.hoverCard) : null);

  $effect(() => {
    if (!root) return;
    const accent = annot.prefs.accent ?? merged.accent;
    let dropHighlightStyle = (): void => {};
    // Repainted on every theme change, not just on mount: the host can move its accent live.
    const theme = applyTheme(
      root,
      {
        ...(accent ? { accent } : {}),
        scheme: annot.prefs.scheme ?? merged.scheme ?? 'auto',
        density: annot.prefs.density,
      },
      (tokens) => {
        annot.palette = drawingPalette(tokens);
        annot.accentSuggestions = accentSuggestions(tokens);
        if (!annot.drawColor) annot.drawColor = annot.palette[0] ?? '';
        dropHighlightStyle = ensureHighlightStyle(annot.doc, tokens);
      },
    );
    return () => {
      theme.destroy();
      clearHighlights(annot.doc);
      dropHighlightStyle();
    };
  });

  $effect(() => {
    if (given) return;
    return connectLive(annot, annot.client, { hot: merged.hot ?? null });
  });

  // A cross-route Locate navigates first and finishes here, once the target has an anchor.
  $effect(() => {
    const view = annot.doc.defaultView;
    if (!view) return;
    let pending: string | null = null;
    try {
      pending = view.sessionStorage?.getItem(LOCATE_KEY) ?? null;
      if (pending) view.sessionStorage.removeItem(LOCATE_KEY);
    } catch {
      return;
    }
    if (!pending) return;
    const id = pending;
    let tries = 0;
    const timer = view.setInterval(() => {
      const ready = annot.anchors.get(id);
      if (ready || (tries += 1) > 20) {
        view.clearInterval(timer);
        if (ready) locate(annot, id);
      }
    }, 150);
    return () => view.clearInterval(timer);
  });

  $effect(() => watchViewport(annot));

  // The proposal is shown on the page while it is pending, and taken off with it.
  $effect(() => {
    previewStyleEdits(annot.doc, annot.styleEdits);
    return () => clearStylePreview(annot.doc);
  });

  // The state commits drawings on its own when Draw closes, but it has no screenshot backend.
  $effect(() => {
    annot.captureFor = (region, strokes) => capturePage(annot, region, strokes);
    return () => (annot.captureFor = null);
  });

  $effect(() => (annot.mode ? watchPageDrops(annot) : undefined));

  $effect(() => bindKeys(annot, host, { commit: () => primaryAction(annot) }));

  $effect(() => freezeWhile(annot, annot.frozen));

  $effect(() => holdScroll(annot, host, annot.mode === 'page'));

  $effect(() => {
    const mode = annot.mode;
    if (!mode) return;
    if (mode === 'text') return textMode(annot);
    if (mode === 'page') return capture ? pageMode(annot, capture) : undefined;
    const blocked = annot.prefs.blockInteractions && !annot.passthrough && capture;
    return elementMode(annot, (blocked ? capture : annot.doc) as HTMLElement);
  });

  $effect(() => {
    void annot.anchors.size;
    void annot.visible.length;
    paintTextHighlights(annot);
  });

  $effect(() => {
    labelInput?.focus();
  });

  const captureOff = $derived(
    annot.mode === 'text' ||
      annot.passthrough ||
      (annot.mode === 'element' && !annot.prefs.blockInteractions),
  );
</script>

<div class="annot-root" bind:this={root}>
  {@html `<style>${css}</style>`}

  <Highlights {annot} textPainted={painted} />

  <div class="layer markers">
    <Markers
      {annot}
      onopen={(id) => {
        annot.setPref('panelOpen', true);
        annot.focusedId = id;
      }}
    />

    {#if annot.mode === 'element' && annot.hover.rect && annot.hover.el && annot.prefs.cssDetails}
      <ElementCard {annot} el={annot.hover.el} rect={annot.hover.rect} />
    {:else if annot.mode === 'element' && annot.hover.rect && annot.hover.label}
      <span
        class="chip label-chip"
        style="left: {annot.hover.rect.x - annot.scroll.x}px; top: {annot.hover.rect.y -
          annot.scroll.y -
          26}px"
      >
        {annot.hover.label}
      </span>
    {/if}

    {#if annot.mode === 'element' && annot.selection.length > 0 && !annot.popup && (annot.selection.length > 1 || annot.inspecting)}
      {@const box = annot.selection[0].getBoundingClientRect()}
      <button
        class="chip"
        style="left: {box.left}px; top: {box.top - 26}px"
        onclick={() => openElementPopup(annot)}
      >
        Annotate{annot.selection.length > 1 ? ` ${annot.selection.length}` : ''}
      </button>
    {/if}

    {#if annot.mode === 'text' && annot.textChip}
      <button
        class="chip"
        disabled={!annot.textChip.enabled}
        style="left: {annot.textChip.rect.x - annot.scroll.x + 6}px; top: {annot.textChip.rect.y -
          annot.scroll.y -
          10}px"
        onclick={() => openTextPopup(annot)}
      >
        {annot.textChip.enabled ? 'Annotate' : annot.textChip.reason}
      </button>
    {/if}

    {#if annot.mode === 'page' && !annot.popup}
      {#if annot.drawTool === 'move' && annot.insideDrawing}
        {@const box = annot.pickedStrokeBox}
        {#if box}
          <Region
            {annot}
            region={box}
            kind="strokes"
            onresize={(from, to) => annot.transformPickedStrokes(from, to)}
            oncommit={() => {
              const id = annot.insideDrawing;
              if (id && annot.drawingRef(id)?.committed) void annot.saveDrawing(id);
            }}
          />
        {/if}
      {:else if annot.drawTool === 'frame' || annot.drawTool === 'move'}
        {@const framing = annot.drawTool === 'frame'}
        {#each [...annot.selectedDrawings] as id (id)}
          {@const ref = annot.drawingRef(id)}
          {#if ref}
            <Region
              {annot}
              region={ref.region}
              kind={framing ? 'frame' : 'move'}
              fit={framing &&
                !ref.committed &&
                annot.regionOverride !== null &&
                id === annot.activeDrawingId}
              onresize={(from, to) =>
                framing ? annot.setDrawingRegion(id, to) : annot.transformDrawing(id, from, to)}
              oncommit={() => ref.committed && void annot.saveDrawing(id)}
            />
          {/if}
        {/each}
      {/if}

      {#if annot.drawingRegion && annot.drawing.strokes.length > 0}
        {@const region = annot.drawingRegion}
        <button
          class="chip"
          style="left: {region.x + region.width - annot.scroll.x - 70}px; top: {region.y -
            annot.scroll.y -
            26}px"
          onclick={() => openPagePopup(annot)}
        >
          Annotate
        </button>
      {/if}
    {/if}

    {#if annot.labelDraft}
      <input
        class="label-input"
        bind:this={labelInput}
        value={annot.labelDraft.text}
        style="left: {annot.labelDraft.at[0] - annot.scroll.x}px; top: {annot.labelDraft.at[1] -
          annot.scroll.y}px"
        aria-label="Label text"
        placeholder="Label…"
        oninput={(e) => {
          if (annot.labelDraft) annot.labelDraft.text = e.currentTarget.value;
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter') commitLabel(annot);
          if (e.key === 'Escape') annot.labelDraft = null;
        }}
        onblur={() => commitLabel(annot)}
      />
    {/if}

    {#if annot.pageDrop}
      <div class="drop-veil">
        <span class="chip">
          {annot.popup ? 'Drop to attach to this note' : 'Write a note first, then drop the file on it'}
        </span>
      </div>
    {/if}

    {#if hovered}
      <HoverCard {annot} annotation={hovered} />
    {/if}
  </div>

  {#if annot.mode}
    <div class="layer capture" class:passthrough={captureOff} class:draw={annot.mode === 'page'} bind:this={capture}></div>
  {/if}

  <div class="chrome">
    {#if annot.connection === 'offline'}
      <div class="banner">Dev server not reachable — annotations are kept in memory.</div>
    {/if}

    <Toolbar
      {annot}
      onsend={() => annot.openSend()}
      onclose={() => annot.collapse()}
    />

    {#if annot.mode === 'page'}
      <DrawBar {annot} />
    {/if}

    {#if annot.paletteOpen}
      <Palette {annot} onlocate={(id) => locate(annot, id)} />
    {/if}

    {#if annot.prefs.panelOpen}
      <Panel {annot} onsend={() => annot.openSend()} onlocate={(id) => locate(annot, id)} />
    {/if}

    {#if annot.popup}
      <Popup {annot} oncommit={(send) => void commitPopup(annot, send)} />
    {/if}

    {#if annot.sendOpen}
      <SendDialog {annot} />
    {/if}

    {#if annot.settingsOpen}
      <Settings {annot} {version} />
    {/if}

    {#if annot.shortcutsOpen}
      <Shortcuts {annot} />
    {/if}

    <Toasts {annot} />

    <div class="sr" role="status" aria-live="polite">{annot.announcement}</div>
  </div>
</div>

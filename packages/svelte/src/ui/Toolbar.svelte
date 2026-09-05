<script lang="ts">
  import type { Mode, StrokeTool } from '@llm-ui-annotation/core';
  import { cornerStyle, nearestCorner } from '../dom/geometry.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';
  import type { IconName } from '../icons.js';

  let {
    annot,
    onsend,
    onclose,
  }: { annot: AnnotState; onsend: () => void; onclose: () => void } = $props();

  const MODES: { mode: Mode; icon: IconName; label: string; key: string }[] = [
    { mode: 'element', icon: 'element', label: 'Element', key: 'E' },
    { mode: 'text', icon: 'text', label: 'Highlight', key: 'H' },
    { mode: 'page', icon: 'page', label: 'Draw', key: 'D' },
  ];

  const TOOLS: { tool: StrokeTool | 'eraser'; icon: IconName; label: string }[] = [
    { tool: 'brush', icon: 'brush', label: 'Brush' },
    { tool: 'arrow', icon: 'arrow', label: 'Arrow' },
    { tool: 'rect', icon: 'rect', label: 'Rectangle' },
    { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
    { tool: 'label', icon: 'caption', label: 'Caption' },
    { tool: 'eraser', icon: 'eraser', label: 'Eraser' },
  ];

  const WIDTHS = [2, 4, 7];

  let dragging = $state<{ x: number; y: number } | null>(null);

  const style = $derived(
    dragging
      ? `left: ${dragging.x}px; top: ${dragging.y}px; right: auto; bottom: auto;`
      : cornerStyle(annot.prefs.corner, 20, annot.prefs.panelOpen ? 376 : 0),
  );

  function startDrag(event: PointerEvent): void {
    const pill = (event.currentTarget as HTMLElement).closest('.pill') as HTMLElement | null;
    const view = annot.doc.defaultView;
    if (!pill || !view) return;
    const box = pill.getBoundingClientRect();
    const offsetX = event.clientX - box.left;
    const offsetY = event.clientY - box.top;
    const move = (e: PointerEvent): void => {
      dragging = { x: e.clientX - offsetX, y: e.clientY - offsetY };
    };
    const up = (e: PointerEvent): void => {
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', up);
      annot.setPref(
        'corner',
        nearestCorner({ x: e.clientX, y: e.clientY }, { width: view.innerWidth, height: view.innerHeight }),
      );
      dragging = null;
    };
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', up);
  }
</script>

<div class="pill" {style} role="toolbar" aria-label="Annotation toolbar">
  {#if !annot.prefs.expanded}
    <button
      class="icon-btn"
      aria-label="Open the annotation toolbar"
      onclick={() => annot.setPref('expanded', true)}
    >
      <Icon name="logo" />
      {#if annot.badge > 0}<span class="badge">{annot.badge}</span>{/if}
    </button>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="grip" onpointerdown={startDrag} aria-hidden="true"><Icon name="grip" size={16} /></span>

    {#each MODES as item (item.mode)}
      <button
        class="icon-btn"
        aria-pressed={annot.mode === item.mode}
        aria-label="{item.label} mode"
        onclick={() => annot.setMode(item.mode)}
      >
        <Icon name={item.icon} />
        <span class="tooltip">{item.label}<kbd>{item.key}</kbd></span>
      </button>
    {/each}

    {#if annot.mode === 'page'}
      <span class="divider"></span>
      {#each TOOLS as item (item.tool)}
        <button
          class="icon-btn"
          aria-pressed={annot.drawTool === item.tool}
          aria-label={item.label}
          onclick={() => (annot.drawTool = item.tool as StrokeTool)}
        >
          <Icon name={item.icon} />
          <span class="tooltip">{item.label}</span>
        </button>
      {/each}
      <span class="divider"></span>
      <span class="swatches">
        {#each annot.palette as color (color)}
          <button
            class="swatch"
            style="background: {color}"
            aria-pressed={annot.drawColor === color}
            aria-label="Colour {color}"
            onclick={() => (annot.drawColor = color)}
          ></button>
        {/each}
      </span>
      <span class="widths">
        {#each WIDTHS as width (width)}
          <button
            class="width-btn"
            aria-pressed={annot.drawWidth === width}
            aria-label="Stroke width {width}"
            onclick={() => (annot.drawWidth = width)}
          >
            <i style="height: {width}px"></i>
          </button>
        {/each}
      </span>
      <button
        class="icon-btn"
        aria-label="Undo stroke"
        disabled={annot.drawing.strokes.length === 0}
        onclick={() => annot.undoStroke()}
      >
        <Icon name="undo" />
        <span class="tooltip">Undo<kbd>⌘Z</kbd></span>
      </button>
      <button
        class="icon-btn"
        aria-label="Redo stroke"
        disabled={annot.drawing.undone.length === 0}
        onclick={() => annot.redoStroke()}
      >
        <Icon name="redo" />
        <span class="tooltip">Redo<kbd>⇧⌘Z</kbd></span>
      </button>
      <button
        class="icon-btn"
        aria-label="Clear drawing"
        disabled={annot.drawing.strokes.length === 0}
        onclick={() => annot.clearDrawing()}
      >
        <Icon name="trash" />
        <span class="tooltip">Clear</span>
      </button>
    {/if}

    <span class="divider"></span>

    <button
      class="icon-btn"
      aria-pressed={annot.frozen}
      aria-label="Pause animations"
      onclick={() => (annot.frozen = !annot.frozen)}
    >
      <Icon name={annot.frozen ? 'play' : 'pause'} />
      <span class="tooltip">{annot.frozen ? 'Resume' : 'Pause'} animations<kbd>⇧P</kbd></span>
    </button>

    <button class="icon-btn" aria-label="Pin visibility: {annot.prefs.markers}" onclick={() => annot.cycleMarkers()}>
      <Icon name={annot.prefs.markers === 'none' ? 'eye-off' : 'eye'} />
      <span class="tooltip">Pins: {annot.prefs.markers}</span>
    </button>

    {#if annot.sendMode === 'batch'}
      <button
        class="icon-btn send-btn"
        aria-label="Send {annot.drafts.length} annotations"
        disabled={annot.drafts.length === 0}
        onclick={onsend}
      >
        <Icon name="send" />
        <span class="count">{annot.drafts.length}</span>
        <span class="tooltip">Send<kbd>⌘↵</kbd></span>
      </button>
    {/if}

    <button
      class="icon-btn"
      aria-pressed={annot.prefs.panelOpen}
      aria-label="Toggle the annotations panel"
      onclick={() => annot.togglePanel()}
    >
      <Icon name="inbox" />
      {#if annot.needsYou.length > 0}<span class="badge">{annot.needsYou.length}</span>{/if}
      <span class="tooltip">Panel<kbd>I</kbd></span>
    </button>

    <span class="divider"></span>

    <button
      class="icon-btn"
      aria-pressed={annot.settingsOpen}
      aria-label="Settings"
      onclick={() => (annot.settingsOpen = !annot.settingsOpen)}
    >
      <Icon name="gear" />
      <span class="tooltip">Settings</span>
    </button>

    <span
      class="dot {annot.connection}"
      title="Dev server {annot.connection}"
      aria-label="Dev server {annot.connection}"
      role="status"
    ></span>

    <button class="icon-btn" aria-label="Collapse the toolbar" onclick={onclose}>
      <Icon name="close" />
      <span class="tooltip">Close<kbd>Esc</kbd></span>
    </button>
  {/if}
</div>

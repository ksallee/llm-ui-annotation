<script lang="ts">
  import type { StrokeTool } from '@llm-ui-annotation/core';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import type { IconName } from '../icons.js';
  import { DRAW_TOOLS, DRAW_WIDTHS, SELECT_TOOLS } from '../draw-tools.js';
  import Icon from './Icon.svelte';
  import { drop } from './motion.js';

  let { annot }: { annot: AnnotState } = $props();

  const tools: { tool: StrokeTool | 'eraser'; icon: IconName; label: string; key: string }[] =
    DRAW_TOOLS.map((t, i) => ({ ...t, key: String(i + 1) }));

  let bar = $state<HTMLElement | null>(null);
  let dragging = $state<{ x: number; y: number } | null>(null);

  const at = $derived(dragging ?? annot.prefs.drawBar);
  const style = $derived(at ? `left: ${at.x}px; top: ${at.y}px; transform: none;` : '');
  // A tooltip renders above its button; below the fold of the viewport top there is no room for one.
  const tipsBelow = $derived((at?.y ?? 16) < 48);

  function startDrag(event: PointerEvent): void {
    const view = annot.doc.defaultView;
    if (!bar || !view) return;
    const box = bar.getBoundingClientRect();
    const offsetX = event.clientX - box.left;
    const offsetY = event.clientY - box.top;
    const clamp = (x: number, y: number): { x: number; y: number } => ({
      x: Math.min(Math.max(x, 8), view.innerWidth - box.width - 8),
      y: Math.min(Math.max(y, 8), view.innerHeight - box.height - 8),
    });
    const move = (e: PointerEvent): void => {
      dragging = clamp(e.clientX - offsetX, e.clientY - offsetY);
    };
    const up = (e: PointerEvent): void => {
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', up);
      annot.setPref('drawBar', clamp(e.clientX - offsetX, e.clientY - offsetY));
      dragging = null;
    };
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', up);
  }
</script>

<div
  class="draw-bar"
  class:tips-below={tipsBelow}
  bind:this={bar}
  {style}
  role="toolbar"
  aria-label="Drawing tools"
  in:drop={{ duration: 200 }}
  out:drop={{ duration: 120 }}
>
  <span class="grip" onpointerdown={startDrag} aria-hidden="true"><Icon name="grip" size={16} /></span>
  {#each SELECT_TOOLS as item (item.tool)}
    <button
      class="icon-btn"
      aria-pressed={annot.drawTool === item.tool}
      aria-label={item.label}
      onclick={() => (annot.drawTool = item.tool)}
    >
      <Icon name={item.icon} />
      <span class="tooltip">{item.label}<kbd>{item.key}</kbd></span>
    </button>
  {/each}

  <span class="divider"></span>

  {#each tools as item (item.tool)}
    <button
      class="icon-btn"
      aria-pressed={annot.drawTool === item.tool}
      aria-label={item.label}
      onclick={() => (annot.drawTool = item.tool)}
    >
      <Icon name={item.icon} />
      <span class="tooltip">{item.label}<kbd>{item.key}</kbd></span>
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
    {#each DRAW_WIDTHS as width (width)}
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

  <span class="divider"></span>

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
</div>

<script lang="ts">
  import type { StrokeTool } from '@llm-ui-annotation/core';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import type { IconName } from '../icons.js';
  import { DRAW_TOOLS, DRAW_WIDTHS } from '../draw-tools.js';
  import Icon from './Icon.svelte';
  import { drop } from './motion.js';

  let { annot }: { annot: AnnotState } = $props();

  const tools: { tool: StrokeTool | 'eraser'; icon: IconName; label: string; key: string }[] =
    DRAW_TOOLS.map((t, i) => ({ ...t, key: String(i + 1) }));
</script>

<div class="draw-bar" role="toolbar" aria-label="Drawing tools" in:drop={{ duration: 200 }} out:drop={{ duration: 120 }}>
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

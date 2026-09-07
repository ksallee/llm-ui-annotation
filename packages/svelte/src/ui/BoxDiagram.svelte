<script lang="ts">
  // The devtools box diagram: nested bands with each layer's numbers on its edges.
  import { shorthand, type BoxModel, type Sides } from '../dom/inspect.js';

  let { box }: { box: BoxModel } = $props();

  const num = (v: number): string => (v === 0 ? '−' : String(Math.round(v * 100) / 100));

  const size = $derived(
    `${Math.round(box.contentBox.width)} × ${Math.round(box.contentBox.height)}`,
  );

  const summary = $derived(
    `margin ${shorthand(box.margin)}, border ${shorthand(box.border)}, ` +
      `padding ${shorthand(box.padding)}, content ${size}`,
  );
</script>

{#snippet band(name: string, sides: Sides, inner: import('svelte').Snippet)}
  <div class="band {name}">
    <span class="name">{name}</span>
    <span class="side top">{num(sides.top)}</span>
    <span class="side right">{num(sides.right)}</span>
    <span class="side bottom">{num(sides.bottom)}</span>
    <span class="side left">{num(sides.left)}</span>
    {@render inner()}
  </div>
{/snippet}

<div class="box-diagram" role="img" aria-label="Box model: {summary}">
  {#snippet content()}
    <div class="band content">{size}</div>
  {/snippet}
  {#snippet padding()}
    {@render band('padding', box.padding, content)}
  {/snippet}
  {#snippet border()}
    {@render band('border', box.border, padding)}
  {/snippet}
  {@render band('margin', box.margin, border)}
</div>

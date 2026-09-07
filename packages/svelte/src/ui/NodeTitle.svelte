<script lang="ts">
  import type { NodeLabel } from '../dom/inspect.js';

  let { label, size = '' }: { label: NodeLabel; size?: string } = $props();
</script>

<div class="node">
  <span class="names">
    <span class="tag">{label.tag}</span
    >{#if label.id}<span class="id">#{label.id}</span>{/if}{#each label.classes as name (name)}<span
        class="cls">.{name}</span
      >{/each}
  </span>
  {#if size}<span class="size">{size}</span>{/if}
</div>

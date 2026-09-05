<script lang="ts">
  import type { AnnotState } from '../annot/annot-annot.svelte.js';

  let { annot }: { annot: AnnotState } = $props();
</script>

<div class="toasts">
  {#each annot.toasts as toast (toast.id)}
    <div class="toast" role="status">
      <span>{toast.text}</span>
      {#if toast.action}
        <button
          onclick={() => {
            toast.action?.run();
            annot.dismissToast(toast.id);
          }}>{toast.action.label}</button
        >
      {/if}
    </div>
  {/each}
</div>

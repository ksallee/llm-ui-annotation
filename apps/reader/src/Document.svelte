<script lang="ts">
  import type { DocModel } from './render.js';

  let { model }: { model: DocModel } = $props();
</script>

<article class="doc">
  {#if model.titleHtml}
    {@html model.titleHtml}
  {/if}

  {#if model.epigraph}
    <div class="epigraph">{@html model.epigraph.html}</div>
  {/if}

  {#each model.sections as section (section.key)}
    <section id="sec-{section.key}">{@html section.html}</section>
  {/each}

  {#if model.coda}
    <div class="coda">{@html model.coda.html}</div>
  {/if}

  {#if !model.titleHtml && model.sections.length === 0 && !model.epigraph}
    <p class="missing">This document is empty.</p>
  {/if}
</article>

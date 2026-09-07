<script lang="ts">
  import { resolveTokens, tokenMap } from '../dom/core-dom.js';
  import { hexOf, inspectElement, type Reading } from '../dom/inspect.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import BoxDiagram from './BoxDiagram.svelte';
  import NodeTitle from './NodeTitle.svelte';
  import StyleEditors from './StyleEditors.svelte';

  let { annot }: { annot: AnnotState } = $props();

  const SWATCHES = new Set(['color', 'background-color', 'border-color']);

  const el = $derived(annot.inspected);
  const seen = $derived(el ? inspectElement(el, annot.detail !== 'compact') : null);
  const styles = $derived(seen?.styles ?? null);
  const entries = $derived(Object.entries(styles ?? {}));
  // The same call `describeElement` makes, so this is what the annotation carries.
  const map = $derived(el && styles ? tokenMap(annot.doc, el) : null);
  const tokens = $derived(map && styles ? resolveTokens(styles, map) : {});
  const others = $derived(annot.selection.length - 1);

  const size = $derived(
    seen?.box ? `${Math.round(seen.box.borderBox.width)} × ${Math.round(seen.box.borderBox.height)}` : '',
  );
</script>

<!-- tabindex 0, not -1: the readings scroll, and a scroll region has to be reachable by keyboard. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="inspect" role="region" aria-label="Inspector" tabindex="0">
  {#if !seen}
    <p class="muted empty">
      Nothing selected. In Element mode, click an element to read its box, type and colour.
    </p>
  {:else}
    <section class="sec">
      <NodeTitle label={seen.label} {size} />
      <div class="mono chain">{seen.chain.join(' › ')}</div>
      <div class="mono sel">{seen.selector}</div>
      {#if others > 0}
        <div class="muted">{others} more element{others === 1 ? '' : 's'} selected</div>
      {/if}
    </section>

    {#if seen.box}
      <BoxDiagram box={seen.box} />
    {/if}

    {#snippet group(title: string, rows: Reading[])}
      {#if rows.length > 0}
        <section class="sec">
          <h4>{title}</h4>
          <dl class="decls">
            {#each rows as [name, value] (name)}
              {@const colour = SWATCHES.has(name)}
              <dt>{name}</dt>
              <dd>
                {#if colour}<span class="swatch inline" style="background: {value}"></span>{/if}
                {colour ? hexOf(value) : value}
              </dd>
            {/each}
          </dl>
        </section>
      {/if}
    {/snippet}

    {@render group('Layout', seen.layout)}
    {@render group('Text', seen.type)}
    {@render group('Appearance', seen.colour)}
    {@render group(
      'Accessibility',
      seen.a11y.map((r): Reading => [r.name, r.value]),
    )}

    {#if el}
      <StyleEditors {annot} {el} />
    {/if}

    <section class="sec">
      <h4>What the agent will see</h4>
      {#if !styles}
        <p class="muted">
          Detail level is <b>compact</b>, so no styles are sent. Settings has the other two.
        </p>
      {:else}
        {#if entries.length <= 2}
          <p class="warn">
            {entries.length === 0 ? 'No properties' : `Only ${entries.length}`} — an element styled by
            global tag rules comes back nearly empty, and the agent gets this much and no more.
          </p>
        {/if}
        <dl class="decls payload">
          {#each entries as [name, value] (name)}
            <dt>{name}</dt>
            <dd>
              {value}
              {#if tokens[name]}<span class="token">{tokens[name]}</span>{/if}
            </dd>
          {/each}
        </dl>
        {#if map && map.skipped > 0}
          <p class="muted">
            {map.skipped} stylesheet{map.skipped === 1 ? '' : 's'} could not be read (cross-origin),
            so a token declared there will not resolve.
          </p>
        {/if}
      {/if}
    </section>
  {/if}
</div>

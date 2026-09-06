<script lang="ts">
  import { resolveTokens, tokenMap } from '../dom/core-dom.js';
  import { inspectElement, type Reading, type Sides } from '../dom/inspect.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';

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

  const sides = (s: Sides): string => `${s.top} ${s.right} ${s.bottom} ${s.left}`;
</script>

<div class="inspect" role="region" aria-label="Inspector" tabindex="-1">
  {#if !seen}
    <p class="muted empty">
      Nothing selected. In Element mode, click an element to read its box, type and colour.
    </p>
  {:else}
    <section class="sec">
      <h4>Identity</h4>
      <div class="ident">{seen.name}</div>
      <div class="mono sel">{seen.selector}</div>
      <div class="muted">{seen.role ?? 'no role'} · &lt;{seen.tag}&gt;</div>
      <div class="mono chain">{seen.chain.join(' › ')}</div>
      {#if others > 0}
        <div class="muted">{others} more element{others === 1 ? '' : 's'} selected</div>
      {/if}
    </section>

    {#if seen.box}
      <section class="sec">
        <h4>Box <span class="muted">top right bottom left</span></h4>
        <dl class="pairs">
          <dt>size</dt>
          <dd class="nums">{seen.box.contentBox.width} × {seen.box.contentBox.height}</dd>
          <dt>padding</dt>
          <dd class="nums">{sides(seen.box.padding)}</dd>
          <dt>border</dt>
          <dd class="nums">{sides(seen.box.border)}</dd>
          <dt>margin</dt>
          <dd class="nums">{sides(seen.box.margin)}</dd>
        </dl>
      </section>
    {/if}

    {#snippet readings(title: string, rows: Reading[])}
      {#if rows.length > 0}
        <section class="sec">
          <h4>{title}</h4>
          <dl class="pairs">
            {#each rows as [name, value] (name)}
              <dt>{name}</dt>
              <dd>
                {#if SWATCHES.has(name)}<span class="swatch" style="background: {value}"></span>{/if}
                {value}
              </dd>
            {/each}
          </dl>
        </section>
      {/if}
    {/snippet}

    {@render readings('Layout', seen.layout)}
    {@render readings('Type', seen.type)}
    {@render readings('Colour', seen.colour)}

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
        <dl class="pairs payload">
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

<script lang="ts">
  import { declaredTokens, describeSelector, resolveDeclared } from '../dom/core-dom.js';
  import { inspectElement, type Reading } from '../dom/inspect.js';
  import { EDITABLE, editableValues } from '../dom/style-edit.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import BoxDiagram from './BoxDiagram.svelte';
  import NodeTitle from './NodeTitle.svelte';
  import StyleRow from './StyleRow.svelte';

  let { annot }: { annot: AnnotState } = $props();

  const el = $derived(annot.inspected);
  const seen = $derived(el ? inspectElement(el, annot.detail !== 'compact') : null);
  const styles = $derived(seen?.styles ?? null);
  const entries = $derived(Object.entries(styles ?? {}));
  // The same call `describeElement` makes, so this is what the annotation carries.
  const map = $derived(el ? declaredTokens(annot.doc, el) : null);
  const tokens = $derived(map && styles ? resolveDeclared(styles, map, seen?.fontPx ?? 0) : {});
  const others = $derived(annot.selection.length - 1);

  const selector = $derived(el ? describeSelector(el).selector : '');
  const values = $derived(el ? editableValues(el) : {});
  const groups = $derived([...new Set(EDITABLE.map((e) => e.group))]);
  const pending = $derived(annot.styleEdits.filter((e) => e.selector === selector));

  const size = $derived(
    seen?.box ? `${Math.round(seen.box.borderBox.width)} × ${Math.round(seen.box.borderBox.height)}` : '',
  );
</script>

<!-- tabindex 0, not -1: the readings scroll, and a scroll region has to be reachable by keyboard. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="inspect" role="region" aria-label="Inspector" tabindex="0">
  {#if !seen || !el}
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

    {#snippet readings(title: string, rows: Reading[])}
      {#if rows.length > 0}
        <section class="sec">
          <h4>{title}</h4>
          <dl class="decls">
            {#each rows as [name, value] (name)}
              <dt>{name}</dt>
              <dd>{value}</dd>
            {/each}
          </dl>
        </section>
      {/if}
    {/snippet}

    {@render readings('Layout', seen.layout)}

    <p class="muted hint">Change a value or pick a token; it rides with your next note.</p>

    {#each groups as group (group)}
      <section class="sec editors">
        <h4>{group}</h4>
        {#each EDITABLE.filter((e) => e.group === group) as item (item.property)}
          <StyleRow {annot} {item} {selector} {values} declared={map ?? new Map()} fontPx={seen.fontPx} />
        {/each}
      </section>
    {/each}

    {@render readings(
      'Accessibility',
      seen.a11y.map((r): Reading => [r.name, r.value]),
    )}

    {#if pending.length > 0}
      <div class="row">
        <span class="muted"
          >{pending.length} change{pending.length === 1 ? '' : 's'} ride{pending.length === 1
            ? 's'
            : ''} with your next note</span
        >
        <span class="spacer"></span>
        <button class="btn quiet small" onclick={() => annot.clearStyleEdits()}>Clear all</button>
      </div>
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
      {/if}
    </section>
  {/if}
</div>

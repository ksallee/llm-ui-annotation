<script lang="ts">
  import { declaredTokens, describeSelector, resolveDeclared } from '../dom/core-dom.js';
  import { sendStyleEdits } from '../controller.js';
  import { matchedDeclarations, type Declaration } from '../dom/declared.js';
  import { withoutPreview } from '../dom/preview.js';
  import { inspectElement, type Reading } from '../dom/inspect.js';
  import { EDITABLE } from '../dom/style-edit.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import BoxDiagram from './BoxDiagram.svelte';
  import NodeTitle from './NodeTitle.svelte';
  import StyleRow from './StyleRow.svelte';

  let { annot }: { annot: AnnotState } = $props();

  const el = $derived(annot.inspected);
  // Read with the proposal off: this is what the annotation carries, and it carries the code.
  const seen = $derived(
    el ? withoutPreview(annot.doc, () => inspectElement(el, annot.detail !== 'compact')) : null,
  );
  const styles = $derived(seen?.styles ?? null);
  const entries = $derived(Object.entries(styles ?? {}));
  // The same call `describeElement` makes, so this is what the annotation carries.
  const map = $derived(el ? declaredTokens(annot.doc, el) : null);
  const tokens = $derived(map && styles ? resolveDeclared(styles, map, seen?.fontPx ?? 0) : {});
  const others = $derived(annot.selection.length - 1);

  const selector = $derived(el ? describeSelector(el).selector : '');
  const pending = $derived(annot.styleEdits.filter((e) => e.selector === selector));

  let picking = $state(false);
  let added = $state<string[]>([]);

  const declarations = $derived(el ? matchedDeclarations(el) : []);
  const own = $derived(new Set(declarations.map((d) => d.property)));
  // A property the source does not set: what the user put on top, and what `+` still offers.
  const overrides = $derived(
    added
      .concat(pending.map((e) => e.property))
      .filter((property, i, all) => !own.has(property) && all.indexOf(property) === i)
      .map((property): Declaration => ({
        property,
        value: computed(property),
        from: 'not set',
        inherited: false,
      })),
  );
  const offered = $derived(
    EDITABLE.filter((item) => !own.has(item.property) && !added.includes(item.property)),
  );

  function computed(property: string): string {
    const style = el ? annot.doc.defaultView?.getComputedStyle(el) : null;
    return style?.getPropertyValue(property).trim() ?? '';
  }

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

    <section class="sec editors">
      <h4>Declared <span class="muted">what the stylesheets say, as written</span></h4>
      {#each declarations as declaration (declaration.property)}
        <StyleRow
          {annot}
          {selector}
          {declaration}
          tokens={map ?? new Map()}
          fontPx={seen.fontPx}
        />
      {/each}

      {#each overrides as declaration (declaration.property)}
        <StyleRow
          {annot}
          {selector}
          {declaration}
          tokens={map ?? new Map()}
          fontPx={seen.fontPx}
          onremove={() => (added = added.filter((other) => other !== declaration.property))}
        />
      {/each}

      <div class="row">
        <button
          class="btn quiet small"
          aria-label="Add a property"
          aria-expanded={picking}
          onclick={() => (picking = !picking)}>+ property</button
        >
      </div>

      {#if picking}
        <div class="parts">
          {#each offered as item (item.property)}
            <button
              class="btn quiet small"
              onclick={() => {
                added = [...added, item.property];
                picking = false;
              }}>{item.property}</button
            >
          {/each}
        </div>
      {/if}
    </section>

    {@render readings(
      'Accessibility',
      seen.a11y.map((r): Reading => [r.name, r.value]),
    )}

    {#if pending.length > 0}
      <div class="row">
        <span class="muted">{pending.length} CSS change{pending.length === 1 ? '' : 's'}</span>
        <span class="spacer"></span>
        <button class="btn quiet small" onclick={() => annot.clearStyleEdits()}>Clear</button>
        <button class="btn primary small" onclick={() => void sendStyleEdits(annot)}>Send</button>
      </div>
      <p class="muted hint">Or write a note and they go with it.</p>
    {/if}

    <section class="sec">
      <h4>What the agent will see</h4>
      {#if pending.length > 0}
        <dl class="decls payload">
          {#each pending as edit (edit.property)}
            <dt>{edit.property}</dt>
            <dd>{edit.from} → {edit.to}</dd>
          {/each}
        </dl>
      {/if}
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

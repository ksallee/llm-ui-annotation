<script lang="ts">
  import { describeSelector } from '../dom/core-dom.js';
  import { EDITABLE, editableValues, sameValue, tokenOptions } from '../dom/style-edit.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';

  let { annot, el }: { annot: AnnotState; el: Element } = $props();

  const selector = $derived(describeSelector(el).selector);
  const values = $derived(editableValues(el));
  const groups = $derived([...new Set(EDITABLE.map((e) => e.group))]);
  const mine = $derived(annot.styleEdits.filter((e) => e.selector === selector));

  const shown = (property: string): string =>
    annot.styleEdit(selector, property)?.to ?? values[property] ?? '';

  function commit(property: string, to: string, token: string | null): void {
    const from = values[property] ?? '';
    if (sameValue(to, from)) annot.dropStyleEdit(selector, property);
    else annot.setStyleEdit({ selector, property, from, to: to.trim(), token });
  }
</script>

<section class="sec editors">
  <h4>Propose a change <span class="muted">rides with your next note</span></h4>

  {#each groups as group (group)}
    <div class="editor-group">
      <span class="group-name">{group}</span>
      {#each EDITABLE.filter((e) => e.group === group) as item (item.property)}
        {@const edit = annot.styleEdit(selector, item.property)}
        {@const options = tokenOptions(annot.doc, el, item.kind)}
        <div class="editor" class:edited={edit}>
          <span class="prop">{item.property}</span>
          <input
            class="field mini"
            value={shown(item.property)}
            aria-label={item.property}
            onchange={(e) => commit(item.property, e.currentTarget.value, null)}
          />
          {#if options.length > 0}
            <select
              class="field mini tokens"
              aria-label="{item.property} token"
              value={edit?.token ?? ''}
              onchange={(e) => {
                const name = e.currentTarget.value;
                if (name) commit(item.property, `var(${name})`, name);
              }}
            >
              <option value="">token…</option>
              {#each options as option (option.name)}
                <option value={option.name}>{option.name} · {option.value}</option>
              {/each}
            </select>
          {/if}
          {#if edit}
            <button
              class="btn quiet small"
              aria-label="Reset {item.property}"
              onclick={() => annot.dropStyleEdit(selector, item.property)}><Icon name="undo" size={14} /></button
            >
          {/if}
        </div>
      {/each}
    </div>
  {/each}

  {#if mine.length > 0}
    <div class="row">
      <span class="muted">{mine.length} change{mine.length === 1 ? '' : 's'} pending</span>
      <span class="spacer"></span>
      <button class="btn quiet small" onclick={() => annot.clearStyleEdits()}>Clear all</button>
    </div>
  {/if}
</section>

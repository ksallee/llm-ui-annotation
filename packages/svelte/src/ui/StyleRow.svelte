<script lang="ts">
  import { hexOf } from '../dom/inspect.js';
  import {
    namedToken,
    sameValue,
    tokenOptions,
    type Editable,
  } from '../dom/style-edit.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';

  let {
    annot,
    item,
    selector,
    values,
    declared,
    fontPx,
  }: {
    annot: AnnotState;
    item: Editable;
    selector: string;
    /** Computed values of the whole editable set, for this element. */
    values: Record<string, string>;
    declared: ReadonlyMap<string, string>;
    fontPx: number;
  } = $props();

  const edit = $derived(annot.styleEdit(selector, item.property));
  const value = $derived(edit?.to ?? values[item.property] ?? '');
  const token = $derived(edit?.token ?? namedToken(item.property, value, declared, fontPx));
  const options = $derived(tokenOptions(declared, item));
  const colour = $derived(item.kind === 'color');

  function commit(to: string, name: string | null): void {
    const from = values[item.property] ?? '';
    if (sameValue(to, from)) annot.dropStyleEdit(selector, item.property);
    else annot.setStyleEdit({ selector, property: item.property, from, to: to.trim(), token: name });
  }
</script>

<div class="editor" class:edited={edit}>
  <span class="prop" title={item.property}>{item.property}</span>
  {#if colour}<span class="swatch inline" style="background: {value}"></span>{/if}
  <input
    class="field mini"
    value={colour ? hexOf(value) : value}
    aria-label={item.property}
    onchange={(e) => commit(e.currentTarget.value, null)}
  />
  {#if options.fitting.length + options.others.length > 0}
    <select
      class="field mini tokens"
      aria-label="{item.property} token"
      value={token ?? ''}
      onchange={(e) => {
        const name = e.currentTarget.value;
        if (name) commit(`var(${name})`, name);
      }}
    >
      <option value="">no token</option>
      <!-- A value of several parts names several tokens; it can be shown, not picked. -->
      {#if token?.includes(' ')}
        <option value={token} disabled>{token}</option>
      {/if}
      {#each options.fitting as option (option.name)}
        <option value={option.name}>{option.name} · {option.value}</option>
      {/each}
      {#if options.others.length > 0}
        <optgroup label="other tokens">
          {#each options.others as option (option.name)}
            <option value={option.name}>{option.name} · {option.value}</option>
          {/each}
        </optgroup>
      {/if}
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

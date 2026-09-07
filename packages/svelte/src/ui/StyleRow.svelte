<script lang="ts">
  import { hexOf } from '../dom/inspect.js';
  import {
    namedToken,
    partLabel,
    sameValue,
    tokenIn,
    tokenOptions,
    type Editable,
  } from '../dom/style-edit.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';
  import Self from './StyleRow.svelte';

  let {
    annot,
    item,
    selector,
    values,
    declared,
    fontPx,
    part = false,
  }: {
    annot: AnnotState;
    item: Editable;
    selector: string;
    /** Computed values of the whole editable set, for this element. */
    values: Record<string, string>;
    declared: ReadonlyMap<string, string>;
    fontPx: number;
    /** A part under its shorthand, indented and with no parts of its own. */
    part?: boolean;
  } = $props();

  let added = $state<string[]>([]);
  let picking = $state(false);

  const parts = $derived(item.parts ?? []);
  const edit = $derived(annot.styleEdit(selector, item.property));
  const value = $derived(edit?.to ?? values[item.property] ?? '');
  const current = $derived(namedToken(item.property, values[item.property] ?? '', declared, fontPx));
  const token = $derived(edit ? edit.token : current);
  const options = $derived(tokenOptions(declared, item));
  const colour = $derived(item.kind === 'color');
  // A part the user added, or one carrying an edit from an earlier visit to this element.
  const shown = $derived(parts.filter((p) => added.includes(p) || annot.styleEdit(selector, p)));

  function commit(to: string, name: string | null): void {
    const from = values[item.property] ?? '';
    const picked = name ?? tokenIn(to);
    // Naming the token a value already comes from changes nothing; naming one it does not is the
    // whole point, even when the two happen to hold the same value.
    const same = picked ? picked === current : sameValue(to, from);
    if (same) {
      annot.dropStyleEdit(selector, item.property);
      return;
    }
    annot.setStyleEdit({ selector, property: item.property, from, to: to.trim(), token: picked });
    // A shorthand overrides its parts, so keeping their edits would only contradict it.
    for (const other of parts) annot.dropStyleEdit(selector, other);
  }
</script>

<div class="editor" class:edited={edit} class:part>
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
  {:else if parts.length > 0}
    <button
      class="btn quiet small"
      aria-label="Add a {item.property} side"
      aria-expanded={picking}
      onclick={() => (picking = !picking)}>+</button
    >
  {/if}
</div>

{#if picking}
  <div class="parts">
    {#each parts.filter((p) => !shown.includes(p)) as property (property)}
      <button
        class="btn quiet small"
        onclick={() => {
          added = [...added, property];
          picking = false;
        }}>{partLabel(item.property, property)}</button
      >
    {/each}
  </div>
{/if}

{#each shown as property (property)}
  <Self
    {annot}
    item={{ property, group: item.group, kind: item.kind }}
    {selector}
    {values}
    {declared}
    {fontPx}
    part
  />
{/each}

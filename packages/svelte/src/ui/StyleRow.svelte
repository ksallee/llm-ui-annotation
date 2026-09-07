<script lang="ts">
  import type { Declaration } from '../dom/declared.js';
  import {
    editableFor,
    namedToken,
    sameValue,
    tokensIn,
    tokenOptions,
  } from '../dom/style-edit.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';

  let {
    annot,
    selector,
    declaration,
    tokens,
    fontPx,
    onremove,
  }: {
    annot: AnnotState;
    /** Selector of the element being inspected, which is what an edit is filed under. */
    selector: string;
    declaration: Declaration;
    /** Every token in scope, by name. */
    tokens: ReadonlyMap<string, string>;
    fontPx: number;
    /** Given to a property the user added, which can be taken off again. */
    onremove?: () => void;
  } = $props();

  const property = $derived(declaration.property);
  const item = $derived(editableFor(property));
  const edit = $derived(annot.styleEdit(selector, property));
  const value = $derived(edit?.to ?? declaration.value);
  const source = $derived(tokensIn(declaration.value) ?? namedToken(property, declaration.value, tokens, fontPx));
  const token = $derived(edit ? edit.token : source);
  const options = $derived(tokenOptions(tokens, item));
  const offers = $derived(options.fitting.length + options.others.length > 0);
  const colour = $derived(item.kind === 'color');

  function commit(to: string, name: string | null): void {
    const from = declaration.value;
    const picked = name ?? tokensIn(to);
    // Naming the token a value already comes from changes nothing; naming one it does not is the
    // whole point, even when the two happen to hold the same value.
    const same = picked ? picked === source : sameValue(to, from);
    if (same) annot.dropStyleEdit(selector, property);
    else annot.setStyleEdit({ selector, property, from, to: to.trim(), token: picked });
  }
</script>

<div class="editor" class:edited={edit} class:added={onremove} class:inherited={declaration.inherited}>
  <span class="prop" title="{property} — {declaration.inherited ? 'inherited from ' : ''}{declaration.from}"
    >{property}</span
  >
  {#if colour}<span class="swatch inline" style="background: {value}"></span>{/if}
  <input
    class="field mini"
    {value}
    aria-label={property}
    onchange={(e) => commit(e.currentTarget.value, null)}
  />
  {#if !offers && token}
    <span class="token">{token}</span>
  {/if}
  {#if offers}
    <select
      class="field mini tokens"
      aria-label="{property} token"
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
  {#if onremove}
    <button
      class="btn quiet small"
      aria-label="Remove {property}"
      onclick={() => {
        annot.dropStyleEdit(selector, property);
        onremove();
      }}><Icon name="close" size={12} /></button
    >
  {:else if edit}
    <button
      class="btn quiet small"
      aria-label="Reset {property}"
      onclick={() => annot.dropStyleEdit(selector, property)}><Icon name="undo" size={14} /></button
    >
  {/if}
</div>

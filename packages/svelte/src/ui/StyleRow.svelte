<script lang="ts">
  import type { Declaration } from '../dom/declared.js';
  import { editableFor, namedToken, sameValue, tokensIn, tokenOptions } from '../dom/style-edit.js';
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
  const source = $derived(
    tokensIn(declaration.value) ?? namedToken(property, declaration.value, tokens, fontPx),
  );
  const token = $derived(edit ? edit.token : source);
  const options = $derived(tokenOptions(tokens, item, value));
  const swatch = $derived(item.kind === 'color' ? value : null);
  // The value already says `var(--x)`; naming it again beside the field would only repeat it.
  const chip = $derived(token && !value.includes('var(') ? token : null);
  const listId = $derived(`annot-tokens-${property}`);

  function commit(to: string): void {
    const from = declaration.value;
    const picked = tokensIn(to);
    // Naming the token a value already comes from changes nothing; naming one it does not is the
    // whole point, even when the two happen to hold the same value.
    const same = picked ? picked === source && sameValue(to, from) : sameValue(to, from);
    if (same) annot.dropStyleEdit(selector, property);
    else annot.setStyleEdit({ selector, property, from, to: to.trim(), token: picked });
  }
</script>

<div class="editor" class:edited={edit} class:added={onremove} class:inherited={declaration.inherited}>
  <span class="prop" title="{property} — {declaration.inherited ? 'inherited from ' : ''}{declaration.from}"
    >{property}</span
  >
  {#if swatch}<span class="swatch inline" style="background: {swatch}"></span>{/if}
  <input
    class="field mini"
    {value}
    aria-label={property}
    list={options.length > 0 ? listId : undefined}
    onchange={(e) => commit(e.currentTarget.value)}
  />
  {#if options.length > 0}
    <!-- Whole values, not names: picking one is never destructive to the rest of the declaration. -->
    <datalist id={listId}>
      {#each options as option (option.name)}
        <option value={option.insert} label="{option.name} · {option.value}"></option>
      {/each}
    </datalist>
  {/if}
  {#if chip}<span class="token">{chip}</span>{/if}
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

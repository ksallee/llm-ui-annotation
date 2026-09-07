<script lang="ts">
  import { declaredTokens, describeSelector } from '../dom/core-dom.js';
  import { hexOf } from '../dom/inspect.js';
  import {
    EDITABLE,
    editableValues,
    namedToken,
    sameValue,
    tokenOptions,
  } from '../dom/style-edit.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';

  let { annot, el }: { annot: AnnotState; el: Element } = $props();

  const selector = $derived(describeSelector(el).selector);
  const declared = $derived(declaredTokens(annot.doc, el));
  const values = $derived(editableValues(el));
  const fontPx = $derived(Number.parseFloat(values['font-size'] ?? '') || 0);
  const groups = $derived([...new Set(EDITABLE.map((e) => e.group))]);
  const mine = $derived(annot.styleEdits.filter((e) => e.selector === selector));

  const current = (property: string): string =>
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
        {@const options = tokenOptions(declared, item)}
        {@const value = current(item.property)}
        {@const token = edit?.token ?? namedToken(item.property, value, declared, fontPx)}
        {@const colour = item.kind === 'color'}
        <div class="editor" class:edited={edit}>
          <span class="prop" title={item.property}>{item.property}</span>
          {#if colour}<span class="swatch inline" style="background: {value}"></span>{/if}
          <input
            class="field mini"
            value={colour ? hexOf(value) : value}
            aria-label={item.property}
            onchange={(e) => commit(item.property, e.currentTarget.value, null)}
          />
          {#if options.fitting.length + options.others.length > 0}
            <select
              class="field mini tokens"
              aria-label="{item.property} token"
              value={token && !token.includes(' ') ? token : ''}
              onchange={(e) => {
                const name = e.currentTarget.value;
                if (name) commit(item.property, `var(${name})`, name);
              }}
            >
              <option value="">token…</option>
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
          <!-- A value of several parts names several tokens, which no select can show. -->
          {#if token && token.includes(' ')}
            <span class="token spans">{token}</span>
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

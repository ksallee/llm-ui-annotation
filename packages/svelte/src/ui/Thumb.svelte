<script lang="ts">
  // The tile at the head of a panel row: the note's mode icon.
  import type { Annotation } from '@llm-ui-annotation/core';
  import Icon from './Icon.svelte';
  import { MODE_ICON } from './mode-icon.js';

  let { annotation }: { annotation: Annotation } = $props();
</script>

<span class="thumb">
  <Icon name={MODE_ICON[annotation.mode]} size={20} />
</span>

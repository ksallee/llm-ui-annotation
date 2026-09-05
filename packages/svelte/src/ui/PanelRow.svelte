<script lang="ts">
  import { summarizeTarget, type Annotation, type Status } from '@llm-ui-annotation/core';
  import { relativeTime } from '../dom/geometry.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Icon from './Icon.svelte';
  import type { IconName } from '../icons.js';

  let {
    annot,
    annotation,
    expanded,
    ontoggle,
    onlocate,
  }: {
    annot: AnnotState;
    annotation: Annotation;
    expanded: boolean;
    ontoggle: () => void;
    onlocate: () => void;
  } = $props();

  const MODE_ICON: Record<string, IconName> = { element: 'element', text: 'text', page: 'page' };

  /** The one action a collapsed row offers, by status. */
  const PRIMARY: Partial<Record<Status, { label: string; icon: IconName }>> = {
    review: { label: 'Approve', icon: 'check' },
    question: { label: 'Answer', icon: 'chat' },
    draft: { label: 'Send', icon: 'send' },
    approved: { label: 'Reopen', icon: 'reopen' },
  };

  let reply = $state('');
  let editing = $state(false);
  let draftComment = $state('');
  let menuOpen = $state(false);
  let replyField = $state<HTMLTextAreaElement | null>(null);

  const a = $derived(annotation);
  const anchor = $derived(annot.anchors.get(a.id));
  const last = $derived(a.thread.at(-1));
  const agent = $derived(annot.lastAgentMessage(a));
  const primary = $derived(PRIMARY[a.status] ?? null);
  const picked = $derived(annot.selected.has(a.id));

  function send(kind: 'answer' | 'reopen' | 'comment'): void {
    const text = reply.trim();
    if (!text) return;
    if (kind === 'answer') void annot.answer(a.id, text);
    if (kind === 'reopen') void annot.reopen(a.id, text);
    if (kind === 'comment') void annot.editComment(a.id, text);
    reply = '';
  }

  function focusReply(): void {
    if (!expanded) ontoggle();
    queueMicrotask(() => replyField?.focus());
  }

  /** Approve and Send land from the collapsed row; the other two need a reason first. */
  function runPrimary(): void {
    if (a.status === 'review') void annot.approve(a.id);
    else if (a.status === 'draft') void annot.sendOne(a.id);
    else focusReply();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="entry"
  class:approved={a.status === 'approved'}
  class:picked
  onmouseenter={() => (annot.previewId = a.id)}
  onmouseleave={() => annot.previewId === a.id && (annot.previewId = null)}
>
  <div class="bar" style="background: var(--annot-{a.status})"></div>
  <div class="body">
    <div class="head-row">
      <input
        class="pick"
        type="checkbox"
        checked={picked}
        aria-label="Select annotation {a.number}"
        onclick={(e) => annot.selectRow(a.id, e.shiftKey ? 'range' : 'toggle')}
      />
      <button class="head" onclick={ontoggle} aria-expanded={expanded}>
        <span class="num">#{a.number}</span>
        <Icon name={MODE_ICON[a.mode] ?? 'element'} size={14} />
        <span class="target">{summarizeTarget(a.target)}</span>
        {#if anchor?.state === 'lost'}<span class="status-pill">lost</span>{/if}
        {#if anchor?.state === 'moved'}<span class="status-pill">moved</span>{/if}
        <span class="when">{relativeTime(a.updatedAt)}</span>
      </button>

      {#if primary}
        <button class="btn small inline-action" onclick={runPrimary}>
          <Icon name={primary.icon} size={14} />
          {primary.label}
        </button>
      {/if}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="menu-wrap"
        onfocusout={(e) => {
          const next = e.relatedTarget as Node | null;
          if (!next || !e.currentTarget.contains(next)) menuOpen = false;
        }}
      >
        <button
          class="icon-btn tiny"
          aria-label="More actions on annotation {a.number}"
          aria-expanded={menuOpen}
          onclick={() => (menuOpen = !menuOpen)}
        >
          <Icon name="more" size={16} />
        </button>
        {#if menuOpen}
          <div class="menu card">
            <button
              onclick={() => {
                draftComment = a.comment;
                editing = true;
                menuOpen = false;
              }}><Icon name="edit" size={14} /> Edit</button
            >
            {#if a.status === 'draft'}
              <button
                onclick={() => {
                  menuOpen = false;
                  void annot.deleteDraft(a.id);
                }}><Icon name="trash" size={14} /> Delete</button
              >
            {/if}
            {#if a.status === 'review' || a.status === 'approved'}
              <button
                onclick={() => {
                  menuOpen = false;
                  focusReply();
                }}><Icon name="reopen" size={14} /> Reopen</button
              >
            {/if}
            <button
              onclick={() => {
                menuOpen = false;
                onlocate();
              }}><Icon name="locate" size={14} /> Locate</button
            >
          </div>
        {/if}
      </div>
    </div>

    {#if editing}
      <textarea class="field" bind:value={draftComment} rows="2" aria-label="Edit the comment"></textarea>
      <div class="actions">
        <button
          class="btn primary small"
          onclick={() => {
            void annot.editComment(a.id, draftComment.trim());
            editing = false;
          }}>Save</button
        >
        <button class="btn small" onclick={() => (editing = false)}>Cancel</button>
      </div>
    {:else}
      <div>{a.comment}</div>
    {/if}

    {#if !expanded && last && last.kind !== 'comment'}
      <div class="muted" style="color: var(--annot-{last.role === 'agent' ? 'accent' : 'ink-2'})">
        {last.role}: {last.text}
      </div>
    {/if}

    {#if expanded}
      <div class="thread">
        {#each a.thread as message (message.id)}
          <div class="msg {message.role}">
            <div class="who">{message.role} · {message.kind}</div>
            <div>{message.text}</div>
          </div>
        {/each}
      </div>

      {#if a.status === 'question'}
        <textarea
          class="field"
          bind:this={replyField}
          bind:value={reply}
          rows="2"
          placeholder="Answer the agent…"
          aria-label="Answer the agent"
        ></textarea>
        <div class="actions">
          <button class="btn primary small" disabled={!reply.trim()} onclick={() => send('answer')}>
            Answer
          </button>
        </div>
      {:else if a.status === 'review'}
        {#if agent}
          <div class="muted">{agent.text}</div>
        {/if}
        <textarea
          class="field"
          bind:this={replyField}
          bind:value={reply}
          rows="2"
          placeholder="Why reopen?"
          aria-label="Why reopen?"
        ></textarea>
        <div class="actions">
          <button class="btn primary small" onclick={() => void annot.approve(a.id)}>Approve</button>
          <button class="btn small" disabled={!reply.trim()} onclick={() => send('reopen')}>
            Reopen
          </button>
        </div>
      {:else if a.status === 'draft'}
        <div class="actions">
          <button
            class="btn small"
            onclick={() => {
              draftComment = a.comment;
              editing = true;
            }}><Icon name="edit" size={14} /> Edit</button
          >
          <button class="btn small" onclick={() => void annot.deleteDraft(a.id)}>
            <Icon name="trash" size={14} /> Delete
          </button>
          <button class="btn primary small" onclick={() => void annot.sendOne(a.id)}>Send this one</button>
        </div>
      {:else if a.status === 'approved'}
        <textarea
          class="field"
          bind:this={replyField}
          bind:value={reply}
          rows="2"
          placeholder="Why reopen?"
          aria-label="Why reopen?"
        ></textarea>
        <div class="actions">
          <button class="btn small" disabled={!reply.trim()} onclick={() => send('reopen')}>Reopen</button>
        </div>
      {:else}
        <textarea
          class="field"
          bind:this={replyField}
          bind:value={reply}
          rows="2"
          placeholder="Add a comment…"
          aria-label="Add a comment"
        ></textarea>
        <div class="actions">
          <button class="btn small" disabled={!reply.trim()} onclick={() => send('comment')}>Comment</button>
        </div>
      {/if}

      <div class="actions">
        <button class="btn quiet small" onclick={onlocate}><Icon name="locate" size={14} /> Locate</button>
      </div>
    {/if}
  </div>
</div>

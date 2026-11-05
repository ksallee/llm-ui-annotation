<script lang="ts">
  import type { Annotation, Status } from '@llm-ui-annotation/core';
  import { relativeTime } from '../dom/geometry.js';
  import type { AnnotState } from '../state/annot-state.svelte.js';
  import Attachments from './Attachments.svelte';
  import { fileDrop } from './drop.js';
  import Icon from './Icon.svelte';
  import Thumb from './Thumb.svelte';
  import { targetLine } from './target-line.js';
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

  type ActionId = 'approve' | 'answer' | 'send' | 'reopen' | 'comment';

  interface RowAction {
    id: ActionId;
    label: string;
    icon: IconName;
    primary: boolean;
    /** Reads `<verb> annotation 3`, so no two rows offer a button with the same name. */
    verb: string;
  }

  const APPROVE: RowAction = { id: 'approve', label: 'Approve', icon: 'check', primary: true, verb: 'Approve' };
  const ANSWER: RowAction = { id: 'answer', label: 'Answer', icon: 'chat', primary: true, verb: 'Answer' };
  const SEND: RowAction = { id: 'send', label: 'Send', icon: 'send', primary: true, verb: 'Send' };
  const REOPEN: RowAction = { id: 'reopen', label: 'Reopen', icon: 'reopen', primary: false, verb: 'Reopen' };
  const COMMENT: RowAction = { id: 'comment', label: 'Comment', icon: 'chat', primary: false, verb: 'Comment on' };

  /** What a row offers while collapsed, by status. No status offers nothing. */
  const ACTIONS: Record<Status, RowAction[]> = {
    draft: [SEND],
    sent: [COMMENT],
    acknowledged: [COMMENT],
    question: [ANSWER],
    review: [APPROVE, REOPEN],
    approved: [REOPEN],
  };

  interface ReplyForm {
    kind: 'answer' | 'reopen' | 'comment';
    label: string;
    placeholder: string;
    aria: string;
    primary: boolean;
  }

  const REPLIES: Record<ReplyForm['kind'], ReplyForm> = {
    answer: { kind: 'answer', label: 'Answer', placeholder: 'Answer the agent…', aria: 'Answer the agent', primary: true },
    reopen: { kind: 'reopen', label: 'Reopen', placeholder: 'Why reopen?', aria: 'Why reopen?', primary: false },
    comment: { kind: 'comment', label: 'Comment', placeholder: 'Add a comment…', aria: 'Add a comment', primary: false },
  };

  let reply = $state('');
  let editing = $state(false);
  let draftComment = $state('');
  let menuOpen = $state(false);
  let replyField = $state<HTMLTextAreaElement | null>(null);

  const a = $derived(annotation);
  const anchor = $derived(annot.anchors.get(a.id));
  const last = $derived(a.thread.at(-1));
  const line = $derived(targetLine(a.target));
  // Expanding puts the answer/reopen/comment field on screen with its own button; the row-level
  // twins of it would then say the same thing twice.
  // A user edit is already in the source: there is nothing to reopen, only the ⋯ menu.
  const offered = $derived(a.kind === 'replace' ? [] : ACTIONS[a.status]);
  const actions = $derived(
    expanded ? offered.filter((x) => x.id === 'approve' || x.id === 'send') : offered,
  );
  const picked = $derived(annot.selected.has(a.id));
  const attachments = $derived(a.attachments ?? []);
  /** The field an expanded row offers, by status. A draft has nothing to reply to. */
  const form = $derived.by((): ReplyForm | null => {
    if (a.kind === 'replace') return null;
    if (a.status === 'question') return REPLIES.answer;
    if (a.status === 'review' || a.status === 'approved') return REPLIES.reopen;
    return a.status === 'draft' ? null : REPLIES.comment;
  });

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

  /** Approve and Send land from the collapsed row; the rest need a reason first. */
  function run(action: ActionId): void {
    if (action === 'approve') void annot.approve(a.id);
    else if (action === 'send' && !a.comment.trim()) {
      draftComment = '';
      editing = true;
    }
    else if (action === 'send') void annot.sendOne(a.id);
    else focusReply();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="entry"
  class:approved={a.status === 'approved'}
  class:picked
  use:fileDrop={(files) => void annot.attach(a.id, files)}
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
        <Thumb {annotation} />
        <span class="lines">
          <span class="meta">
            <span class="num">#{a.number}</span>
            <span class="status-pill" style="background: var(--annot-{a.status}-fill)">{a.status}</span>
            {#if anchor?.state === 'lost'}<span class="status-pill">lost</span>{/if}
            {#if anchor?.state === 'moved'}<span class="status-pill">moved</span>{/if}
            <span class="when">{relativeTime(a.updatedAt)}</span>
          </span>
          <span class="target">
            <span class="name">{line.name}</span>
            {#if line.where}<span class="where">{line.where}</span>{/if}
          </span>
        </span>
      </button>
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
    {:else if a.comment.trim()}
      <div class="comment">{a.comment}</div>
    {:else}
      <button
        class="comment needs-comment"
        onclick={() => {
          draftComment = '';
          editing = true;
        }}>Say what should change before sending this</button
      >
    {/if}

    <Attachments {annot} id={a.id} items={attachments} />
    <span class="drop-hint"><Icon name="clip" size={14} /> Drop to attach to #{a.number}</span>

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

      {#if form}
        <textarea
          class="field"
          bind:this={replyField}
          bind:value={reply}
          rows="2"
          placeholder={form.placeholder}
          aria-label={form.aria}
        ></textarea>
        <div class="actions">
          <button
            class="btn small"
            class:primary={form.primary}
            disabled={!reply.trim()}
            onclick={() => send(form.kind)}>{form.label}</button
          >
        </div>
      {/if}
    {/if}

    <div class="row-actions">
      {#each actions as action (action.id)}
        <button
          class="btn small inline-action"
          class:primary={action.primary}
          aria-label="{action.verb} annotation {a.number}"
          onclick={() => run(action.id)}
        >
          <Icon name={action.icon} size={14} />
          {action.label}
        </button>
      {/each}
      <span class="spacer"></span>
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
            <button
              onclick={() => {
                menuOpen = false;
                void annot.deleteRow(a.id);
              }}><Icon name="trash" size={14} /> Delete</button
            >
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
  </div>
</div>

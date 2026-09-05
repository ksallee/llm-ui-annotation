import { describe, expect, it } from 'vitest';
import { isTyping, keyAction, type KeyContext } from '../src/keyboard.js';

const key = (init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent =>
  new KeyboardEvent('keydown', { bubbles: true, ...init });

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({
  mode: null,
  popupOpen: false,
  dialogOpen: false,
  focusedDraft: false,
  ...over,
});

describe('isTyping', () => {
  it('ignores keys typed into the host page', () => {
    const input = document.createElement('input');
    document.body.append(input);
    expect(isTyping(input, null)).toBe(true);

    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.append(div);
    expect(isTyping(div, null)).toBe(true);
    expect(isTyping(document.body, null)).toBe(false);
  });

  it('does not ignore keys typed inside the overlay', () => {
    const host = document.createElement('annot-overlay');
    const input = document.createElement('textarea');
    host.append(input);
    document.body.append(host);
    expect(isTyping(input, host)).toBe(false);
  });
});

describe('keyAction', () => {
  it('maps the mode letters', () => {
    expect(keyAction(key({ key: 'e' }), ctx())).toBe('mode:element');
    expect(keyAction(key({ key: 'T' }), ctx())).toBe('mode:text');
    expect(keyAction(key({ key: 'p' }), ctx())).toBe('mode:page');
  });

  it('separates page mode from pause', () => {
    expect(keyAction(key({ key: 'P', shiftKey: true }), ctx())).toBe('pause');
    expect(keyAction(key({ key: 'P' }), ctx())).toBe('mode:page');
  });

  it('always answers Escape, even with a dialog open', () => {
    expect(keyAction(key({ key: 'Escape' }), ctx({ dialogOpen: true }))).toBe('escape');
  });

  it('commits only when no surface owns the keystroke', () => {
    expect(keyAction(key({ key: 'Enter', metaKey: true }), ctx())).toBe('commit');
    expect(keyAction(key({ key: 'Enter', metaKey: true }), ctx({ popupOpen: true }))).toBeNull();
    expect(keyAction(key({ key: 'Enter', metaKey: true }), ctx({ dialogOpen: true }))).toBeNull();
  });

  it('swallows plain letters while a popup or dialog is open', () => {
    expect(keyAction(key({ key: 'e' }), ctx({ popupOpen: true }))).toBeNull();
    expect(keyAction(key({ key: 'i' }), ctx({ dialogOpen: true }))).toBeNull();
  });

  it('undo and redo only exist in page mode', () => {
    expect(keyAction(key({ key: 'z', metaKey: true }), ctx({ mode: 'element' }))).toBeNull();
    expect(keyAction(key({ key: 'z', metaKey: true }), ctx({ mode: 'page' }))).toBe('undo');
    expect(keyAction(key({ key: 'Z', metaKey: true, shiftKey: true }), ctx({ mode: 'page' }))).toBe('redo');
  });

  it('deletes only when a draft marker has focus', () => {
    expect(keyAction(key({ key: 'Backspace' }), ctx())).toBeNull();
    expect(keyAction(key({ key: 'Backspace' }), ctx({ focusedDraft: true }))).toBe('delete');
  });

  it('ignores modified letters', () => {
    expect(keyAction(key({ key: 'e', metaKey: true }), ctx())).toBeNull();
    expect(keyAction(key({ key: 'h', altKey: true }), ctx())).toBeNull();
  });
});

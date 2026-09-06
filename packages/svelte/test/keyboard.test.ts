import { describe, expect, it } from 'vitest';
import {
  comboOf,
  DEFAULT_PALETTE_KEY,
  formatCombo,
  isTyping,
  keyAction,
  type KeyContext,
} from '../src/keyboard.js';

const key = (init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent =>
  new KeyboardEvent('keydown', { bubbles: true, ...init });

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({
  mode: 'element',
  popupOpen: false,
  dialogOpen: false,
  paletteOpen: false,
  panelOpen: false,
  focusedDraft: false,
  paletteKey: DEFAULT_PALETTE_KEY,
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

  it('catches typing in our own fields, which retarget to the host', () => {
    const host = document.createElement('annot-overlay');
    const root = host.attachShadow({ mode: 'open' });
    const field = document.createElement('textarea');
    const button = document.createElement('button');
    root.append(field, button);
    document.body.append(host);

    // A caption or an answer field is in the shadow root, so the event target is the host itself.
    button.focus();
    expect(isTyping(host, host)).toBe(false);
    field.focus();
    expect(isTyping(host, host)).toBe(true);

    host.remove();
  });
});

describe('comboOf', () => {
  it('names a chord by its code, so the layout cannot change it', () => {
    expect(comboOf(key({ key: 'å', code: 'KeyA', altKey: true }))).toBe('Alt+KeyA');
    expect(comboOf(key({ key: 'Meta', code: 'MetaLeft', metaKey: true }))).toBe('');
    expect(formatCombo('Alt+KeyA')).toBe('⌥A');
    expect(formatCombo('Meta+Shift+Digit1')).toBe('⌘⇧1');
  });
});

describe('keyAction', () => {
  it('binds nothing but the palette while the overlay is idle', () => {
    const idle = ctx({ mode: null });
    for (const k of ['e', 'h', 'd', 'i', 'p', '?']) {
      expect(keyAction(key({ key: k }), idle), k).toBeNull();
    }
    expect(keyAction(key({ key: 'Escape' }), idle)).toBeNull();
    expect(keyAction(key({ key: 'a', code: 'KeyA', altKey: true }), idle)).toBe('palette');
  });

  it('maps the mode letters while a mode is active', () => {
    expect(keyAction(key({ key: 'e' }), ctx())).toBe('mode:element');
    expect(keyAction(key({ key: 'H' }), ctx())).toBe('mode:text');
    expect(keyAction(key({ key: 'd' }), ctx())).toBe('mode:page');
  });

  it('pause needs the shift', () => {
    expect(keyAction(key({ key: 'P', shiftKey: true }), ctx())).toBe('pause');
    expect(keyAction(key({ key: 'p' }), ctx())).toBeNull();
  });

  it('answers Escape for any open surface, and nothing when everything is closed', () => {
    expect(keyAction(key({ key: 'Escape' }), ctx({ mode: null, dialogOpen: true }))).toBe('escape');
    expect(keyAction(key({ key: 'Escape' }), ctx({ mode: null, panelOpen: true }))).toBe('escape');
    expect(keyAction(key({ key: 'Escape' }), ctx({ mode: null }))).toBeNull();
  });

  it('the palette owns the keyboard while it is open', () => {
    expect(keyAction(key({ key: 'e' }), ctx({ paletteOpen: true }))).toBeNull();
    expect(keyAction(key({ key: 'Escape' }), ctx({ paletteOpen: true }))).toBe('escape');
    expect(keyAction(key({ key: 'a', code: 'KeyA', altKey: true }), ctx({ paletteOpen: true }))).toBe(
      'palette',
    );
  });

  it('commits only when a mode is active and no surface owns the keystroke', () => {
    expect(keyAction(key({ key: 'Enter', metaKey: true }), ctx())).toBe('commit');
    expect(keyAction(key({ key: 'Enter', metaKey: true }), ctx({ mode: null }))).toBeNull();
    expect(keyAction(key({ key: 'Enter', metaKey: true }), ctx({ popupOpen: true }))).toBeNull();
    expect(keyAction(key({ key: 'Enter', metaKey: true }), ctx({ dialogOpen: true }))).toBeNull();
  });

  it('swallows plain letters while a popup or dialog is open', () => {
    expect(keyAction(key({ key: 'e' }), ctx({ popupOpen: true }))).toBeNull();
    expect(keyAction(key({ key: 'i' }), ctx({ dialogOpen: true }))).toBeNull();
  });

  it('numbers pick a drawing tool, but only in Draw', () => {
    expect(keyAction(key({ key: '3' }), ctx({ mode: 'page' }))).toBe('tool:3');
    expect(keyAction(key({ key: '3' }), ctx({ mode: 'element' }))).toBeNull();
  });

  it('undo and redo only exist in Draw', () => {
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
    expect(keyAction(key({ key: 'd', code: 'KeyD', altKey: true }), ctx())).toBeNull();
  });
});

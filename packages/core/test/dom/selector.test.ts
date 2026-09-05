/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { describeElement } from '../../src/dom/describe.js';
import { isStableClass, stableClasses } from '../../src/dom/css.js';
import { describeSelector, resolveSelector } from '../../src/dom/selector.js';
import { allElements, FIXTURES, loadFixture } from './helpers.js';

const UNSTABLE = /svelte-[a-z0-9]|css-[a-z0-9]|sc-[A-Za-z]|__[a-z0-9]{5,}/;
const UTILITY = /\.(px|py|mx|my|bg|text|flex|items|justify|rounded|gap|shadow|leading|tracking)-/;

describe('describeSelector', () => {
  it('round-trips every element in every fixture', () => {
    for (const name of FIXTURES) {
      const doc = loadFixture(name);
      for (const el of allElements(doc)) {
        const { selector } = describeSelector(el);
        expect(resolveSelector(doc, selector), `${name}: ${selector}`).toBe(el);
      }
    }
  });

  it('round-trips through every fallback too', () => {
    for (const name of FIXTURES) {
      const doc = loadFixture(name);
      for (const el of allElements(doc)) {
        for (const fallback of describeSelector(el).fallbacks) {
          expect(resolveSelector(doc, fallback), `${name}: ${fallback}`).toBe(el);
        }
      }
    }
  });

  it('never puts a hashed or utility class in a selector', () => {
    for (const name of FIXTURES) {
      const doc = loadFixture(name);
      for (const el of allElements(doc)) {
        const { selector, fallbacks } = describeSelector(el);
        for (const candidate of [selector, ...fallbacks]) {
          expect(candidate, `${name}: ${candidate}`).not.toMatch(UNSTABLE);
          expect(candidate, `${name}: ${candidate}`).not.toMatch(UTILITY);
        }
      }
    }
  });

  it('skips Svelte 5 scoped classes', () => {
    const doc = loadFixture('ids');
    const el = doc.querySelector('#page-title') as Element;
    el.setAttribute('class', 's-WttdRAdHhDza headline');
    expect(stableClasses(el)).toEqual(['headline']);
    expect(isStableClass('s-WttdRAdHhDza')).toBe(false);
    expect(isStableClass('s-large')).toBe(true);
  });

  it('prefers a readable id and skips generated ones', () => {
    const doc = loadFixture('ids');
    expect(describeSelector(doc.querySelector('#page-title') as Element).selector).toBe('#page-title');
    expect(describeSelector(doc.querySelector('#svelte-a1b2c3') as Element).selector).not.toContain('svelte');
    expect(describeSelector(doc.querySelector('#_9f8e7d6c5b') as Element).selector).not.toContain('#_');
    expect(describeSelector(doc.querySelector('#root-3d4e5f6a7b') as Element).selector).not.toContain('#root');
  });

  it('uses test id attributes before anything else', () => {
    const doc = loadFixture('ids');
    expect(describeSelector(doc.querySelector('aside') as Element).selector).toBe('[data-testid="tips"]');
    expect(describeSelector(doc.querySelector('[data-cy]') as Element).selector).toBe('[data-cy="tip-two"]');
  });

  it('uses name, aria-label, href, alt and placeholder', () => {
    const form = loadFixture('form');
    expect(describeSelector(form.querySelector('[name=fullname]') as Element).selector).toBe(
      'input[name="fullname"]',
    );
    expect(describeSelector(form.querySelector('img') as Element).selector).toBe('img[alt="Acme logo"]');

    const list = loadFixture('list');
    expect(describeSelector(list.querySelector('a[href="/pricing"]') as Element).selector).toBe(
      'a[href="/pricing"]',
    );
    expect(describeSelector(list.querySelector('a[href^=https]') as Element).selector).toBe(
      'a[href*="/docs"]',
    );

    const chrome = loadFixture('chrome');
    expect(describeSelector(chrome.querySelector('[aria-label]') as Element).selector).toBe(
      'button[aria-label="Open menu"]',
    );
  });

  it('walks up with nth-of-type for repeated items', () => {
    const doc = loadFixture('list');
    const third = doc.querySelectorAll('.steps .step')[2] as Element;
    const { selector } = describeSelector(third);
    expect(selector).toContain(':nth-of-type(3)');
    expect(resolveSelector(doc, selector)).toBe(third);
  });

  it('crosses open shadow roots with >>>', () => {
    const doc = loadFixture('shadow');
    const widget = doc.querySelector('my-widget') as Element;
    const save = widget.shadowRoot?.querySelector('.save') as Element;
    const { selector } = describeSelector(save);
    expect(selector).toContain(' >>> ');
    expect(resolveSelector(doc, selector)).toBe(save);

    const badge = widget.shadowRoot?.querySelector('inner-badge') as Element;
    const count = badge.shadowRoot?.querySelector('.count') as Element;
    const nested = describeSelector(count).selector;
    expect(nested.split('>>>')).toHaveLength(3);
    expect(resolveSelector(doc, nested)).toBe(count);
  });

  it('always offers the full path as the last fallback', () => {
    const doc = loadFixture('table');
    const cell = doc.querySelectorAll('tbody td')[4] as Element;
    const { fallbacks } = describeSelector(cell);
    expect(fallbacks[fallbacks.length - 1]).toMatch(/^body > /);
  });

  it('resolveSelector returns null for a missing shadow host', () => {
    const doc = loadFixture('list');
    expect(resolveSelector(doc, 'nav >>> .nope')).toBeNull();
    expect(resolveSelector(doc, '')).toBeNull();
  });

  it('describeElement carries the same selector', () => {
    const doc = loadFixture('ids');
    const el = doc.querySelector('#refresh') as Element;
    expect(describeElement(el).selector).toBe('#refresh');
  });
});

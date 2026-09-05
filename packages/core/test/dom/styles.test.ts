/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { computedStyles, formatStyleValue } from '../../src/dom/styles.js';
import { toOklch } from '../../src/dom/oklch.js';
import { loadFixture } from './helpers.js';

describe('toOklch', () => {
  it('converts hex, rgb and named colors', () => {
    expect(toOklch('#ff0000')).toBe('oklch(0.628 0.258 29.23)');
    expect(toOklch('rgb(255, 0, 0)')).toBe('oklch(0.628 0.258 29.23)');
    expect(toOklch('red')).toBe('oklch(0.628 0.258 29.23)');
    expect(toOklch('#fff')).toBe('oklch(1 0 0)');
    expect(toOklch('rgba(0, 0, 0, 0.5)')).toBe('oklch(0 0 0 / 0.5)');
  });

  it('leaves what it cannot parse alone', () => {
    expect(toOklch('var(--brand)')).toBe('var(--brand)');
    expect(toOklch('oklch(0.7 0.1 250)')).toBe('oklch(0.7 0.1 250)');
  });
});

describe('formatStyleValue', () => {
  it('reports colors in oklch, keeping a hex or named original', () => {
    expect(formatStyleValue('color', '#ff0000')).toBe('oklch(0.628 0.258 29.23) (#ff0000)');
    expect(formatStyleValue('background-color', 'red')).toBe('oklch(0.628 0.258 29.23) (red)');
    expect(formatStyleValue('background-color', 'rgb(255, 0, 0)')).toBe('oklch(0.628 0.258 29.23)');
  });

  it('rounds numbers to two decimals', () => {
    expect(formatStyleValue('font-size', '16.00042px')).toBe('16px');
    expect(formatStyleValue('line-height', '1.33333')).toBe('1.33');
  });
});

describe('computedStyles', () => {
  it('reports what the author set and stays quiet about the rest', () => {
    const doc = loadFixture('chrome');
    doc.body.insertAdjacentHTML(
      'beforeend',
      '<style>.probe{color:#123456;border-radius:6px}</style><p class="probe">x</p><p>y</p>',
    );
    const styled = computedStyles(doc.querySelector('.probe') as Element);
    expect(styled['color']).toBe('oklch(0.319 0.072 251.17) (#123456)');
    expect(styled['border-radius']).toBe('6px');

    const plain = computedStyles(doc.querySelectorAll('p')[2] as Element);
    expect(plain['color']).toBeUndefined();
    expect(plain['border-radius']).toBeUndefined();
  });

  it('adds the layout properties to flex and grid containers', () => {
    const doc = loadFixture('chrome');
    doc.body.insertAdjacentHTML(
      'beforeend',
      '<style>.row{display:flex;justify-content:space-between}</style><div class="row"></div>',
    );
    const styles = computedStyles(doc.querySelector('.row') as Element);
    expect(styles['display']).toBe('flex');
    expect(styles['justify-content']).toBe('space-between');
  });

  it('leaves no more than twenty entries', () => {
    const doc = loadFixture('chrome');
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      expect(Object.keys(computedStyles(el)).length).toBeLessThanOrEqual(20);
    }
  });
});

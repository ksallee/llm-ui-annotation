/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { isOverlay } from '../../src/dom/ancestors.js';
import { describeElement, findElementsInRect } from '../../src/dom/describe.js';
import { allElements, FIXTURES, loadFixture, rect, setRect } from './helpers.js';

describe('describeElement', () => {
  it('names elements the way the spec spells them', () => {
    const form = loadFixture('form');
    expect(describeElement(form.querySelector('#email') as Element).name).toBe(
      'input[email] "Work email"',
    );
    expect(describeElement(form.querySelector('[name=fullname]') as Element).name).toBe(
      'input[text] "Full name"',
    );
    expect(describeElement(form.querySelector('[name=password]') as Element).name).toBe(
      'input[password] "Password"',
    );
    expect(describeElement(form.querySelector('[type=submit]') as Element).name).toBe(
      'input[submit] "Create account"',
    );
    expect(describeElement(form.querySelector('img') as Element).name).toBe('img "Acme logo"');
  });

  it('labels icon-only buttons', () => {
    const doc = loadFixture('chrome');
    const [menu, close, plain] = Array.from(doc.querySelectorAll('.icon-button'));
    expect(describeElement(menu as Element).name).toBe('button "Open menu" (icon)');
    expect(describeElement(close as Element).name).toBe('button "Close" (icon)');
    expect(describeElement(plain as Element).name).toBe('button (icon)');
  });

  it('maps implicit roles', () => {
    const table = loadFixture('table');
    expect(describeElement(table.querySelector('th') as Element).role).toBe('columnheader');
    expect(describeElement(table.querySelector('td') as Element).role).toBe('cell');
    expect(describeElement(table.querySelector('table') as Element).role).toBe('table');

    const list = loadFixture('list');
    expect(describeElement(list.querySelector('nav') as Element).role).toBe('navigation');
    expect(describeElement(list.querySelector('ul') as Element).role).toBe('list');
    expect(describeElement(list.querySelector('li') as Element).role).toBe('listitem');
    expect(describeElement(list.querySelector('a') as Element).role).toBe('link');

    const ids = loadFixture('ids');
    expect(describeElement(ids.querySelector('h1') as Element).role).toBe('heading');
  });

  it('drops unstable classes from attrs but keeps the raw ones when detailed', () => {
    const doc = loadFixture('classes');
    const header = doc.querySelector('.site-header') as Element;
    const ref = describeElement(header);
    expect(ref.attrs['class']).toBe('site-header');
    expect(ref.attrs['class:raw']).toBe('site-header svelte-1x2y3z');

    const soup = doc.querySelector('.flex') as Element;
    expect(soup.getAttribute('class')).toContain('px-6');
    expect(describeElement(soup).attrs['class']).toBeUndefined();
  });

  it('omits styles and context in compact mode', () => {
    const doc = loadFixture('ids');
    const ref = describeElement(doc.querySelector('#refresh') as Element, {
      styles: false,
      context: false,
    });
    expect(ref.styles).toBeUndefined();
    expect(ref.context).toBeUndefined();
    expect(ref.attrs['class:raw']).toBeUndefined();
  });

  it('reports fixed and sticky ancestry', () => {
    const doc = loadFixture('chrome');
    expect(describeElement(doc.querySelector('.brand') as Element).fixed).toBe(true);
    expect(describeElement(doc.querySelector('.subnav span') as Element).fixed).toBe(true);
    expect(describeElement(doc.querySelector('main p') as Element).fixed).toBe(false);
  });

  it('names the neighbours', () => {
    const doc = loadFixture('list');
    const second = doc.querySelectorAll('.steps .step')[1] as Element;
    expect(describeElement(second).context).toEqual({
      parent: 'ol "Install the plugin Open the app Annotat…"',
      prev: 'li "Install the plugin"',
      next: 'li "Annotate something"',
    });
  });

  it('skips the overlay host everywhere', () => {
    const doc = loadFixture('ids');
    const overlay = doc.createElement('annot-overlay');
    overlay.innerHTML = '<button>Send</button>';
    doc.body.appendChild(overlay);
    expect(isOverlay(overlay.querySelector('button') as Element)).toBe(true);
    expect(isOverlay(doc.querySelector('#refresh') as Element)).toBe(false);

    const main = doc.querySelector('#app') as Element;
    expect(describeElement(main).context?.next).toBeNull();
  });

  it('produces a usable ref for every element in every fixture', () => {
    for (const name of FIXTURES) {
      const doc = loadFixture(name);
      for (const el of allElements(doc)) {
        const ref = describeElement(el);
        expect(ref.tag).toBe(el.tagName.toLowerCase());
        expect(ref.selector.length).toBeGreaterThan(0);
        expect(Number.isInteger(ref.rect.x)).toBe(true);
      }
    }
  });
});

describe('findElementsInRect', () => {
  const region = rect(30, 30, 840, 480);

  it('returns the cards and the heading, not the page or the tiny icons', () => {
    const doc = loadFixture('cards');
    const found = findElementsInRect(doc, region);
    const names = found.map((f) => f.name);

    expect(names).toContain('h2 "Popular plans"');
    for (const plan of ['Starter For one person.', 'Team For a small team.', 'Scale For a company.'])
      expect(names).toContain(`article "${plan}"`);
    expect(names.some((n) => n.startsWith('span'))).toBe(false);
    expect(names.some((n) => n.startsWith('body'))).toBe(false);
    expect(names.some((n) => n.includes('Far below'))).toBe(false);
  });

  it('sorts by overlap and caps at twelve compact refs', () => {
    const doc = loadFixture('cards');
    const found = findElementsInRect(doc, region);
    expect(found.length).toBeLessThanOrEqual(12);
    expect(found[0]?.styles).toBeUndefined();
    const areas = found.map((f) => f.rect.width * f.rect.height);
    expect(areas).toEqual([...areas].sort((a, b) => b - a));
  });

  it('drops a parent a single child already covers', () => {
    const doc = loadFixture('cards');
    doc.body.innerHTML = '<div class="outer"><span class="inner">x</span></div>';
    setRect(doc.querySelector('.outer') as Element, rect(0, 0, 200, 100));
    setRect(doc.querySelector('.inner') as Element, rect(0, 0, 200, 100));
    expect(findElementsInRect(doc, rect(0, 0, 400, 400)).map((f) => f.tag)).toEqual(['span']);
  });

  it('falls back to the oversized element when nothing else matches', () => {
    const doc = loadFixture('cards');
    doc.body.innerHTML = '<section class="hero">Hero</section>';
    setRect(doc.querySelector('.hero') as Element, rect(0, 0, 300, 200));
    expect(findElementsInRect(doc, rect(0, 0, 300, 200)).map((f) => f.tag)).toEqual(['section']);
  });
});

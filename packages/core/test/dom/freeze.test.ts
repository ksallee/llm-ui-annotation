/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import { freezeAnimations } from '../../src/dom/freeze.js';
import { loadFixture } from './helpers.js';

describe('freezeAnimations', () => {
  it('injects a marked style sheet and takes it back', () => {
    const doc = loadFixture('chrome');
    const unfreeze = freezeAnimations(doc);
    const style = doc.querySelector('style[data-annot-freeze]');
    expect(style?.textContent).toContain('animation-play-state: paused');
    expect(style?.textContent).toContain('*:not(annot-overlay)');

    unfreeze();
    expect(doc.querySelector('style[data-annot-freeze]')).toBeNull();
  });

  it('pauses playing videos and resumes only those', () => {
    const doc = loadFixture('chrome');
    doc.body.insertAdjacentHTML('beforeend', '<video id="a"></video><video id="b"></video>');
    const playing = doc.querySelector('#a') as HTMLVideoElement;
    const stopped = doc.querySelector('#b') as HTMLVideoElement;
    for (const [video, paused] of [
      [playing, false],
      [stopped, true],
    ] as const) {
      Object.defineProperty(video, 'paused', { value: paused, configurable: true });
      video.pause = vi.fn();
      video.play = vi.fn(() => Promise.resolve());
    }

    const unfreeze = freezeAnimations(doc);
    expect(playing.pause).toHaveBeenCalled();
    expect(stopped.pause).not.toHaveBeenCalled();

    unfreeze();
    expect(playing.play).toHaveBeenCalled();
    expect(stopped.play).not.toHaveBeenCalled();
  });

  it('honours a custom overlay tag', () => {
    const doc = loadFixture('chrome');
    freezeAnimations(doc, 'my-overlay')();
    expect(doc.querySelector('style[data-annot-freeze]')).toBeNull();
  });
});

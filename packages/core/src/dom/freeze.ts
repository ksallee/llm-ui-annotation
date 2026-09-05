const MARKER = 'data-annot-freeze';

/** Pause animations, transitions and videos everywhere but the overlay. Returns the undo. */
export function freezeAnimations(doc: Document, overlayTag = 'annot-overlay'): () => void {
  const style = doc.createElement('style');
  style.setAttribute(MARKER, '');
  style.textContent = `*:not(${overlayTag}):not(${overlayTag} *) {
  animation-play-state: paused !important;
  transition: none !important;
}`;
  (doc.head ?? doc.documentElement).appendChild(style);

  const paused = Array.from(doc.querySelectorAll('video')).filter((video) => !video.paused);
  for (const video of paused) video.pause();

  return () => {
    style.remove();
    for (const video of paused) void video.play()?.catch(() => undefined);
  };
}

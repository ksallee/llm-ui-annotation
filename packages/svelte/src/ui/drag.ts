import type { Point } from '../dom/geometry.js';

/** Follows a pointer drag on the window, reporting the top-left the dragged box should take. */
export function dragBox(
  view: Window,
  event: PointerEvent,
  box: DOMRect,
  onMove: (at: Point) => void,
  onDrop: (at: Point, event: PointerEvent) => void,
): void {
  const offsetX = event.clientX - box.left;
  const offsetY = event.clientY - box.top;
  const at = (e: PointerEvent): Point => ({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  const move = (e: PointerEvent): void => onMove(at(e));
  const up = (e: PointerEvent): void => {
    view.removeEventListener('pointermove', move);
    view.removeEventListener('pointerup', up);
    onDrop(at(e), e);
  };
  view.addEventListener('pointermove', move);
  view.addEventListener('pointerup', up);
}

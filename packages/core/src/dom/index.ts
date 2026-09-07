export { contentFrame, type ContentFrameOptions } from './frame.js';
export { collapse, escapeIdent, isStableClass, isUtilityClass, quoteValue, truncate } from './css.js';
export { isOverlay } from './ancestors.js';
export { describeElement, findElementsInRect, type DescribeOptions } from './describe.js';
export { describeSelector, fullPath, resolveSelector, SHADOW_SEP, type SelectorRef } from './selector.js';
export { describeName, isIconOnly, labelOf, visibleText } from './name.js';
export { roleOf } from './roles.js';
export {
  area,
  clientRectsOf,
  inflate,
  intersect,
  mergeLineRects,
  rectOf,
  scrollOffset,
  union,
} from './rect.js';
export { computedStyles, formatStyleValue } from './styles.js';
export {
  declaredTokens,
  normalizeValue,
  resolveDeclared,
  resolveTokens,
  tokenMap,
  TOKEN_FAMILIES,
  type TokenMap,
} from './tokens.js';
export {
  anchorText,
  blockContainer,
  describeRange,
  indexText,
  normalize,
  rangeRects,
  type Anchor,
  type ContainerText,
  type DescribeRangeResult,
  type Normalized,
} from './text.js';
export {
  labelBox,
  transformStrokes,
  translateStrokes,
  renderStrokes,
  strokeBounds,
  type Point,
  type StrokeContext,
} from './strokes.js';
export { captureRegion, pickCaptureTarget, type CaptureOptions } from './capture.js';
export { freezeAnimations } from './freeze.js';

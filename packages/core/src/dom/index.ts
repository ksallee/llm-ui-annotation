export { collapse, escapeIdent, isStableClass, isUtilityClass, quoteValue, truncate } from './css.js';
export { isOverlay } from './ancestors.js';
export { describeElement, type DescribeOptions } from './describe.js';
export { describeSelector, fullPath, resolveSelector, SHADOW_SEP, type SelectorRef } from './selector.js';
export { matchedDeclarations, parseDeclarations, type Declaration } from './declared.js';
export { describeName, isIconOnly, labelOf, visibleText } from './name.js';
export { roleOf } from './roles.js';
export { sourceOf, type SourceLoc } from './source.js';
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
export { freezeAnimations } from './freeze.js';

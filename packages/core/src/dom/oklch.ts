import { parseColor } from '../theme/color.js';

export { toOklch } from '../theme/color.js';

export function isParsableColor(css: string): boolean {
  return parseColor(css) !== null;
}

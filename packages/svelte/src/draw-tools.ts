import type { StrokeTool } from '@llm-ui-annotation/core';
import type { IconName } from './icons.js';

export interface DrawToolEntry {
  tool: StrokeTool | 'eraser';
  icon: IconName;
  label: string;
}

/** The drawing bar's tools, in the order their `1`–`6` shortcuts follow. */
export const DRAW_TOOLS: DrawToolEntry[] = [
  { tool: 'brush', icon: 'brush', label: 'Brush' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
  { tool: 'label', icon: 'caption', label: 'Caption' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser' },
];

export const DRAW_WIDTHS = [2, 4, 7];

export interface SelectToolEntry {
  tool: 'move' | 'frame';
  icon: IconName;
  label: string;
  key: string;
}

/** The two tools that act on what is already drawn, first in the bar. */
export const SELECT_TOOLS: SelectToolEntry[] = [
  { tool: 'move', icon: 'move', label: 'Move', key: 'V' },
  { tool: 'frame', icon: 'frame', label: 'Frame', key: 'F' },
];

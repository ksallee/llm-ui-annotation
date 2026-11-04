/** The names of every CSS custom property the overlay sets. */

/** Status and mode colors. Every one has a line color, a fill, a wash and an ink. */
export const SIGNAL_NAMES = [
  'element',
  'text',
  'draft',
  'sent',
  'acknowledged',
  'question',
  'review',
  'approved',
  'lost',
] as const;

export type SignalName = (typeof SIGNAL_NAMES)[number];

export type SignalToken =
  | `--annot-${SignalName}`
  | `--annot-${SignalName}-fill`
  | `--annot-${SignalName}-wash`
  | `--annot-${SignalName}-ink`;

const BASE_TOKENS = [
  '--annot-color-scheme',
  '--annot-accent',
  '--annot-accent-ink',
  '--annot-accent-soft',
  '--annot-accent-line',
  '--annot-surface',
  '--annot-surface-2',
  '--annot-surface-3',
  '--annot-ink',
  '--annot-ink-2',
  '--annot-ink-3',
  '--annot-line',
  '--annot-shadow',
  '--annot-scrim',
  '--annot-pill',
  '--annot-pill-ink',
  '--annot-pill-hover',
  '--annot-pill-active',
  '--annot-box-content',
  '--annot-box-padding',
  '--annot-box-border',
  '--annot-box-margin',
  '--annot-box-ink',
  '--annot-font',
  '--annot-font-mono',
  '--annot-text-xs',
  '--annot-text-sm',
  '--annot-text-md',
  '--annot-text-lg',
  '--annot-text-mono',
  '--annot-space-1',
  '--annot-space-2',
  '--annot-space-3',
  '--annot-space-4',
  '--annot-space-5',
  '--annot-radius',
  '--annot-radius-sm',
  '--annot-radius-pill',
  '--annot-radius-marker',
  '--annot-pill-h',
  '--annot-control-h',
  '--annot-marker-size',
  '--annot-panel-w',
  '--annot-popup-w',
  '--annot-motion-fast',
  '--annot-motion-enter',
  '--annot-motion-exit',
  '--annot-ease',
] as const;

export type BaseToken = (typeof BASE_TOKENS)[number];
export type TokenName = BaseToken | SignalToken;

export const TOKEN_NAMES: readonly TokenName[] = [
  ...BASE_TOKENS,
  ...SIGNAL_NAMES.flatMap((n): SignalToken[] => [
    `--annot-${n}`,
    `--annot-${n}-fill`,
    `--annot-${n}-wash`,
    `--annot-${n}-ink`,
  ]),
];

export type ThemeTokens = Record<TokenName, string>;

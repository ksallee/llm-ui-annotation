/** Files a user drops on an annotation. Sniffed, capped and stored under `attachments/`. */

export const ATTACHMENTS_DIR = 'attachments';

export const ACCEPTED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/markdown',
  'text/plain',
  'text/csv',
  'application/json',
] as const;

export type AttachmentType = (typeof ACCEPTED_ATTACHMENT_TYPES)[number];

export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_TOTAL_MAX_BYTES = 50 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 10;
export const ATTACHMENT_NAME_MAX = 120;

const EXTENSIONS: Record<AttachmentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'text/markdown': 'md',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
};

const TEXT_BY_EXTENSION: Record<string, AttachmentType> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  svg: 'image/svg+xml',
};

const MAGIC: [readonly number[], AttachmentType][] = [
  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
  [[0xff, 0xd8, 0xff], 'image/jpeg'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif'],
  [[0x25, 0x50, 0x44, 0x46, 0x2d], 'application/pdf'],
];

const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** File extension stored on disk for `type`. */
export function attachmentExtension(type: string): string {
  return EXTENSIONS[type as AttachmentType] ?? 'bin';
}

export function isAttachmentType(type: unknown): type is AttachmentType {
  return typeof type === 'string' && (ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(type);
}

/** `attachments/<annotationId>`, relative to the annotations dir. */
export function attachmentDir(annotationId: string): string {
  return `${ATTACHMENTS_DIR}/${annotationId}`;
}

/** `attachments/<annotationId>/<attachmentId>.<ext>`, relative to the annotations dir. */
export function attachmentFile(annotationId: string, attachmentId: string, ext: string): string {
  return `${attachmentDir(annotationId)}/${attachmentId}.${ext}`;
}

/** Basename, control characters dropped, capped at 120 chars. */
export function cleanAttachmentName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean === '' ? 'file' : clean).slice(0, ATTACHMENT_NAME_MAX);
}

function startsWith(bytes: Uint8Array, magic: readonly number[], at = 0): boolean {
  if (bytes.length < at + magic.length) return false;
  return magic.every((b, i) => bytes[at + i] === b);
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Control characters no accepted text format contains. */
// eslint-disable-next-line no-control-regex
const BINARY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

function sniffText(text: string, ext: string): AttachmentType | null {
  if (BINARY_CONTROL.test(text)) return null;
  const head = text.trimStart().slice(0, 512).toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml';
  }
  if (ext === 'svg') return null;
  const claimed = TEXT_BY_EXTENSION[ext];
  if (claimed === 'application/json') {
    try {
      JSON.parse(text);
      return 'application/json';
    } catch {
      return 'text/plain';
    }
  }
  return claimed ?? 'text/plain';
}

/** Type of `bytes` from magic bytes, then the extension of `name`; null when nothing accepted matches. */
export function sniffAttachmentType(bytes: Uint8Array, name = ''): AttachmentType | null {
  if (bytes.length === 0) return null;
  for (const [magic, type] of MAGIC) if (startsWith(bytes, magic)) return type;
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  const text = decodeUtf8(bytes);
  return text === null ? null : sniffText(text, extensionOf(cleanAttachmentName(name)));
}

/** `240 KB`, `1.1 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = unit === 0 || value >= 10 ? String(Math.round(value)) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

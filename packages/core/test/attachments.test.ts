import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  attachmentExtension,
  attachmentFile,
  cleanAttachmentName,
  formatBytes,
  isAttachmentType,
  sniffAttachmentType,
  validateAnnotation,
} from '../src/index.js';
import { ATTACHMENTS, ATTACHED_ANNOTATION, annotation } from './fixtures.js';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46);
const GIF = text('GIF89a________');
const PDF = text('%PDF-1.7\n1 0 obj');
const WEBP = new Uint8Array([...text('RIFF'), 0, 0, 0, 0, ...text('WEBPVP8 ')]);

describe('sniffAttachmentType', () => {
  it('reads the binary formats from magic bytes', () => {
    expect(sniffAttachmentType(PNG, 'a.txt')).toBe('image/png');
    expect(sniffAttachmentType(JPEG, 'a.txt')).toBe('image/jpeg');
    expect(sniffAttachmentType(GIF, 'a.txt')).toBe('image/gif');
    expect(sniffAttachmentType(WEBP, 'a.txt')).toBe('image/webp');
    expect(sniffAttachmentType(PDF, 'a.txt')).toBe('application/pdf');
  });

  it('ignores what the name claims when the bytes disagree', () => {
    expect(sniffAttachmentType(PNG, 'evil.pdf')).toBe('image/png');
    expect(sniffAttachmentType(PDF, 'mock.png')).toBe('application/pdf');
  });

  it('falls back to the extension for text', () => {
    expect(sniffAttachmentType(text('# Title\n'), 'notes.md')).toBe('text/markdown');
    expect(sniffAttachmentType(text('a,b\n1,2\n'), 'rows.csv')).toBe('text/csv');
    expect(sniffAttachmentType(text('{"a":1}'), 'data.json')).toBe('application/json');
    expect(sniffAttachmentType(text('hello'), 'notes.txt')).toBe('text/plain');
    expect(sniffAttachmentType(text('hello'), 'notes')).toBe('text/plain');
  });

  it('treats invalid json named .json as plain text', () => {
    expect(sniffAttachmentType(text('not json'), 'data.json')).toBe('text/plain');
  });

  it('recognizes svg by its root element, not its name', () => {
    expect(sniffAttachmentType(text('<svg xmlns="x"></svg>'), 'logo.txt')).toBe('image/svg+xml');
    expect(sniffAttachmentType(text('<?xml version="1.0"?><svg></svg>'), 'logo.svg')).toBe(
      'image/svg+xml',
    );
    expect(sniffAttachmentType(text('<html><script>x</script></html>'), 'evil.svg')).toBeNull();
  });

  it('refuses binary that is not an accepted format, and empty bodies', () => {
    expect(sniffAttachmentType(bytes(0x50, 0x4b, 0x03, 0x04, 0, 0))).toBeNull();
    expect(sniffAttachmentType(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffAttachmentType(bytes())).toBeNull();
  });

  it('every type it can return is accepted', () => {
    for (const type of [PNG, JPEG, GIF, WEBP, PDF]) {
      expect(isAttachmentType(sniffAttachmentType(type))).toBe(true);
    }
    expect(ACCEPTED_ATTACHMENT_TYPES).toContain('text/markdown');
  });
});

describe('cleanAttachmentName', () => {
  it('keeps the basename only', () => {
    expect(cleanAttachmentName('../../etc/passwd')).toBe('passwd');
    expect(cleanAttachmentName('C:\\Users\\me\\mock.png')).toBe('mock.png');
  });

  it('caps at 120 chars and never returns empty', () => {
    expect(cleanAttachmentName(`${'a'.repeat(300)}.png`)).toHaveLength(120);
    expect(cleanAttachmentName('   ')).toBe('file');
    expect(cleanAttachmentName('/')).toBe('file');
  });
});

describe('formatBytes', () => {
  it('is human readable', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(245760)).toBe('240 KB');
    expect(formatBytes(1153434)).toBe('1.1 MB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB');
  });
});

describe('paths', () => {
  it('builds attachments/<annotationId>/<attachmentId>.<ext>', () => {
    expect(attachmentFile('A'.repeat(26), 'B'.repeat(26), 'png')).toBe(
      `attachments/${'A'.repeat(26)}/${'B'.repeat(26)}.png`,
    );
    expect(attachmentExtension('image/jpeg')).toBe('jpg');
    expect(attachmentExtension('application/json')).toBe('json');
  });
});

describe('validateAnnotation', () => {
  it('accepts an annotation with attachments', () => {
    expect(validateAnnotation(ATTACHED_ANNOTATION)).toEqual([]);
  });

  it('accepts one without the field', () => {
    expect(validateAnnotation(annotation())).toEqual([]);
  });

  it('refuses a traversing path', () => {
    const bad = { ...ATTACHMENTS[0], path: '../../../etc/passwd' };
    const problems = validateAnnotation({ ...ATTACHED_ANNOTATION, attachments: [bad] });
    expect(problems).toContain(
      'attachments[0].path: expected attachments/<annotationId>/<attachmentId>.<ext>',
    );
  });

  it('refuses a path pointing at another annotation', () => {
    const bad = {
      ...ATTACHMENTS[0],
      path: `attachments/${'C'.repeat(26)}/${ATTACHMENTS[0]?.id ?? ''}.png`,
    };
    const problems = validateAnnotation({ ...ATTACHED_ANNOTATION, attachments: [bad] });
    expect(problems).toContain('attachments[0].path: must name this annotation and this attachment');
  });

  it('reports every missing field', () => {
    const problems = validateAnnotation({ ...ATTACHED_ANNOTATION, attachments: [{}] });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('attachments[0].id'),
        expect.stringContaining('attachments[0].name'),
        expect.stringContaining('attachments[0].type'),
        expect.stringContaining('attachments[0].bytes'),
        expect.stringContaining('attachments[0].at'),
        expect.stringContaining('attachments[0].by'),
        expect.stringContaining('attachments[0].path'),
      ]),
    );
  });
});

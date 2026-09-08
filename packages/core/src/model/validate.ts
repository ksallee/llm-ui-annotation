import { isId } from './id.js';
import {
  ACTORS,
  MESSAGE_KINDS,
  MODES,
  STATUSES,
  SUPPORTED_PROTOCOL_VERSIONS,
  type Annotation,
  type Batch,
} from './types.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Caps on anything a page can grow. Generous — they exist so a hostile or looping writer cannot
 * inflate a route file the store rewrites whole on every mutation, not to shape real input.
 */
export const LIMITS = {
  text: 10_000,
  quote: 5_000,
  selector: 1_000,
  array: 1_000,
  points: 20_000,
} as const;

type Rec = Record<string, unknown>;

function isRec(x: unknown): x is Rec {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

class Problems {
  readonly list: string[] = [];

  add(message: string): void {
    this.list.push(message);
  }

  str(v: unknown, path: string): boolean {
    if (typeof v !== 'string') {
      this.add(`${path}: expected string, got ${typeName(v)}`);
      return false;
    }
    return true;
  }

  num(v: unknown, path: string): boolean {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.add(`${path}: expected finite number, got ${typeName(v)}`);
      return false;
    }
    return true;
  }

  bool(v: unknown, path: string): boolean {
    if (typeof v !== 'boolean') {
      this.add(`${path}: expected boolean, got ${typeName(v)}`);
      return false;
    }
    return true;
  }

  oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): v is T {
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      this.add(`${path}: expected one of ${allowed.join('|')}, got ${JSON.stringify(v)}`);
      return false;
    }
    return true;
  }

  id(v: unknown, path: string): boolean {
    if (!isId(v)) {
      this.add(`${path}: expected a 26-char id, got ${JSON.stringify(v)}`);
      return false;
    }
    return true;
  }

  iso(v: unknown, path: string): boolean {
    if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v))) {
      this.add(`${path}: expected an ISO 8601 UTC timestamp, got ${JSON.stringify(v)}`);
      return false;
    }
    return true;
  }

  isoOrNull(v: unknown, path: string): boolean {
    return v === null ? true : this.iso(v, path);
  }

  arr(v: unknown, path: string, max: number = LIMITS.array): v is unknown[] {
    if (!Array.isArray(v)) {
      this.add(`${path}: expected array, got ${typeName(v)}`);
      return false;
    }
    if (v.length > max) {
      this.add(`${path}: expected at most ${max} entries, got ${v.length}`);
      return false;
    }
    return true;
  }

  /** A string within its cap. Callers that pass a cap are the ones a page can grow. */
  capped(v: unknown, path: string, max: number): boolean {
    if (!this.str(v, path)) return false;
    if ((v as string).length > max) {
      this.add(`${path}: expected at most ${max} characters, got ${(v as string).length}`);
      return false;
    }
    return true;
  }

  rec(v: unknown, path: string): v is Rec {
    if (!isRec(v)) {
      this.add(`${path}: expected object, got ${typeName(v)}`);
      return false;
    }
    return true;
  }

  stringMap(v: unknown, path: string): void {
    if (!this.rec(v, path)) return;
    for (const [k, val] of Object.entries(v)) {
      this.str(val, `${path}.${k}`);
    }
  }

  rect(v: unknown, path: string): void {
    if (!this.rec(v, path)) return;
    for (const k of ['x', 'y', 'width', 'height']) this.num(v[k], `${path}.${k}`);
  }

  point(v: unknown, path: string): void {
    if (!this.arr(v, path)) return;
    if (v.length !== 2) this.add(`${path}: expected [x, y]`);
    for (let i = 0; i < Math.min(v.length, 2); i++) this.num(v[i], `${path}[${i}]`);
  }
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function checkSource(p: Problems, v: unknown, path: string): void {
  if (!p.rec(v, path)) return;
  p.capped(v['file'], `${path}.file`, LIMITS.selector);
  for (const key of ['line', 'column']) {
    if (v[key] !== undefined) p.num(v[key], `${path}.${key}`);
  }
}

function checkDeclaration(p: Problems, v: unknown, path: string): void {
  if (!p.rec(v, path)) return;
  p.capped(v['property'], `${path}.property`, LIMITS.selector);
  p.capped(v['value'], `${path}.value`, LIMITS.quote);
  p.capped(v['from'], `${path}.from`, LIMITS.selector);
  p.bool(v['inherited'], `${path}.inherited`);
  if (v['file'] !== undefined) p.capped(v['file'], `${path}.file`, LIMITS.selector);
}

function checkElementRef(p: Problems, v: unknown, path: string): void {
  if (!p.rec(v, path)) return;
  p.capped(v['selector'], `${path}.selector`, LIMITS.selector);
  if (p.arr(v['fallbacks'], `${path}.fallbacks`)) {
    v['fallbacks'].forEach((f, i) => p.capped(f, `${path}.fallbacks[${i}]`, LIMITS.selector));
  }
  p.capped(v['tag'], `${path}.tag`, LIMITS.selector);
  if (v['role'] !== null) p.capped(v['role'], `${path}.role`, LIMITS.selector);
  p.capped(v['name'], `${path}.name`, LIMITS.quote);
  p.capped(v['text'], `${path}.text`, LIMITS.quote);
  p.rect(v['rect'], `${path}.rect`);
  p.bool(v['fixed'], `${path}.fixed`);
  p.stringMap(v['attrs'], `${path}.attrs`);
  if (v['source'] !== undefined) checkSource(p, v['source'], `${path}.source`);
  if (v['declared'] !== undefined && p.arr(v['declared'], `${path}.declared`)) {
    v['declared'].forEach((d, i) => checkDeclaration(p, d, `${path}.declared[${i}]`));
  }
  if (v['styles'] !== undefined) p.stringMap(v['styles'], `${path}.styles`);
  if (v['tokens'] !== undefined) p.stringMap(v['tokens'], `${path}.tokens`);
  if (v['context'] !== undefined && p.rec(v['context'], `${path}.context`)) {
    for (const k of ['parent', 'prev', 'next']) {
      const val = v['context'][k];
      if (val !== null) p.str(val, `${path}.context.${k}`);
    }
  }
}

function checkStroke(p: Problems, v: unknown, path: string): void {
  if (!p.rec(v, path)) return;
  const tool = v['tool'];
  switch (tool) {
    case 'brush':
      if (p.arr(v['points'], `${path}.points`, LIMITS.points)) {
        v['points'].forEach((pt, i) => p.point(pt, `${path}.points[${i}]`));
      }
      p.str(v['color'], `${path}.color`);
      p.num(v['width'], `${path}.width`);
      break;
    case 'arrow':
      p.point(v['from'], `${path}.from`);
      p.point(v['to'], `${path}.to`);
      p.str(v['color'], `${path}.color`);
      p.num(v['width'], `${path}.width`);
      break;
    case 'rect':
    case 'ellipse':
      p.rect(v['rect'], `${path}.rect`);
      p.str(v['color'], `${path}.color`);
      p.num(v['width'], `${path}.width`);
      break;
    case 'label':
      p.point(v['at'], `${path}.at`);
      p.capped(v['text'], `${path}.text`, LIMITS.text);
      p.str(v['color'], `${path}.color`);
      p.num(v['size'], `${path}.size`);
      break;
    default:
      p.add(`${path}.tool: expected one of brush|arrow|rect|ellipse|label, got ${JSON.stringify(tool)}`);
  }
}

function checkTarget(p: Problems, v: unknown, mode: unknown, path: string): void {
  if (!p.rec(v, path)) return;
  const kind = v['kind'];
  if (typeof mode === 'string' && kind !== mode) {
    p.add(`${path}.kind: ${JSON.stringify(kind)} does not match mode ${JSON.stringify(mode)}`);
  }
  switch (kind) {
    case 'element': {
      if (!p.arr(v['elements'], `${path}.elements`)) return;
      if (v['elements'].length === 0) p.add(`${path}.elements: expected at least one element`);
      v['elements'].forEach((e, i) => checkElementRef(p, e, `${path}.elements[${i}]`));
      return;
    }
    case 'text': {
      checkElementRef(p, v['container'], `${path}.container`);
      p.capped(v['quote'], `${path}.quote`, LIMITS.quote);
      p.str(v['prefix'], `${path}.prefix`);
      p.str(v['suffix'], `${path}.suffix`);
      const startOk = p.num(v['start'], `${path}.start`);
      const endOk = p.num(v['end'], `${path}.end`);
      if (startOk && endOk && (v['start'] as number) > (v['end'] as number)) {
        p.add(`${path}.start: must not be greater than ${path}.end`);
      }
      if (p.arr(v['rects'], `${path}.rects`)) {
        v['rects'].forEach((r, i) => p.rect(r, `${path}.rects[${i}]`));
      }
      if (v['blocks'] !== undefined && p.arr(v['blocks'], `${path}.blocks`)) {
        if (v['blocks'].length < 2) p.add(`${path}.blocks: expected at least two blocks`);
        v['blocks'].forEach((b, i) => checkElementRef(p, b, `${path}.blocks[${i}]`));
      }
      return;
    }
    case 'page': {
      p.rect(v['region'], `${path}.region`);
      if (p.arr(v['strokes'], `${path}.strokes`)) {
        v['strokes'].forEach((s, i) => checkStroke(p, s, `${path}.strokes[${i}]`));
      }
      if (v['screenshot'] !== null && p.str(v['screenshot'], `${path}.screenshot`)) {
        // The CLI opens this path and the agent reads it, so it is a name we issued or nothing.
        if (!SCREENSHOT_PATH.test(v['screenshot'] as string)) {
          p.add(`${path}.screenshot: expected screenshots/<id>.png`);
        }
      }
      if (p.arr(v['elements'], `${path}.elements`)) {
        v['elements'].forEach((e, i) => checkElementRef(p, e, `${path}.elements[${i}]`));
      }
      return;
    }
    default:
      p.add(`${path}.kind: expected one of element|text|page, got ${JSON.stringify(kind)}`);
  }
}

function checkMessage(p: Problems, v: unknown, path: string): void {
  if (!p.rec(v, path)) return;
  p.id(v['id'], `${path}.id`);
  p.oneOf(v['role'], ACTORS, `${path}.role`);
  p.oneOf(v['kind'], MESSAGE_KINDS, `${path}.kind`);
  p.capped(v['text'], `${path}.text`, LIMITS.text);
  p.iso(v['at'], `${path}.at`);
}

const ATTACHMENT_PATH = /^attachments\/[0-9A-HJKMNP-TV-Z]{26}\/[0-9A-HJKMNP-TV-Z]{26}\.[a-z0-9]{1,8}$/;
const SCREENSHOT_PATH = /^screenshots\/[0-9A-HJKMNP-TV-Z]{26}\.png$/;

function checkAttachment(p: Problems, v: unknown, annotationId: unknown, path: string): void {
  if (!p.rec(v, path)) return;
  const idOk = p.id(v['id'], `${path}.id`);
  p.str(v['name'], `${path}.name`);
  p.str(v['type'], `${path}.type`);
  p.num(v['bytes'], `${path}.bytes`);
  p.iso(v['at'], `${path}.at`);
  p.oneOf(v['by'], ACTORS, `${path}.by`);
  if (!p.str(v['path'], `${path}.path`)) return;
  const value = v['path'] as string;
  if (!ATTACHMENT_PATH.test(value)) {
    p.add(`${path}.path: expected attachments/<annotationId>/<attachmentId>.<ext>`);
    return;
  }
  if (idOk && isId(annotationId) && !value.startsWith(`attachments/${annotationId}/${v['id'] as string}.`)) {
    p.add(`${path}.path: must name this annotation and this attachment`);
  }
}

const CSS_PROPERTY = /^[a-z][a-z-]*$/;

function checkStyleEdit(p: Problems, v: unknown, path: string): void {
  if (!p.rec(v, path)) return;
  p.str(v['selector'], `${path}.selector`);
  p.str(v['from'], `${path}.from`);
  if (p.str(v['property'], `${path}.property`) && !CSS_PROPERTY.test(v['property'] as string)) {
    p.add(`${path}.property: expected a CSS property name`);
  }
  if (p.str(v['to'], `${path}.to`) && (v['to'] as string).trim() === '') {
    p.add(`${path}.to: must not be empty`);
  }
  if (v['token'] !== null && p.str(v['token'], `${path}.token`)) {
    if (!(v['token'] as string).startsWith('--')) p.add(`${path}.token: expected a custom property`);
  }
  if (v['rule'] !== undefined && p.rec(v['rule'], `${path}.rule`)) {
    p.capped(v['rule']['selector'], `${path}.rule.selector`, LIMITS.selector);
    if (v['rule']['file'] !== undefined) {
      p.capped(v['rule']['file'], `${path}.rule.file`, LIMITS.selector);
    }
  }
}

/** Every problem with `x` as an Annotation; empty when it is valid. */
export function validateAnnotation(x: unknown): string[] {
  const p = new Problems();
  if (!p.rec(x, 'annotation')) return p.list;

  p.id(x['id'], 'id');
  if (!(SUPPORTED_PROTOCOL_VERSIONS as readonly unknown[]).includes(x['protocolVersion'])) {
    p.add(
      `protocolVersion: expected ${SUPPORTED_PROTOCOL_VERSIONS.join(' or ')}, got ${JSON.stringify(x['protocolVersion'])}`,
    );
  }
  if (p.str(x['route'], 'route') && !(x['route'] as string).startsWith('/')) {
    p.add('route: must start with /');
  }
  p.str(x['url'], 'url');
  p.oneOf(x['mode'], MODES, 'mode');
  checkTarget(p, x['target'], x['mode'], 'target');
  p.capped(x['comment'], 'comment', LIMITS.text);
  const status = x['status'];
  p.oneOf(status, STATUSES, 'status');

  if (p.arr(x['thread'], 'thread')) {
    x['thread'].forEach((m, i) => checkMessage(p, m, `thread[${i}]`));
  }

  if (x['batch'] !== null) p.id(x['batch'], 'batch');
  if (p.num(x['number'], 'number') && !Number.isInteger(x['number'])) {
    p.add('number: must be an integer');
  }

  if (p.rec(x['viewport'], 'viewport')) {
    for (const k of ['width', 'height', 'dpr', 'scrollX', 'scrollY']) {
      p.num(x['viewport'][k], `viewport.${k}`);
    }
  }

  p.iso(x['createdAt'], 'createdAt');
  p.iso(x['updatedAt'], 'updatedAt');
  p.isoOrNull(x['sentAt'], 'sentAt');
  p.isoOrNull(x['resolvedAt'], 'resolvedAt');
  p.isoOrNull(x['approvedAt'], 'approvedAt');

  const res = x['resolution'];
  if (res !== null) {
    if (p.rec(res, 'resolution')) {
      p.oneOf(res['kind'], ['changed', 'declined'] as const, 'resolution.kind');
      p.capped(res['summary'], 'resolution.summary', LIMITS.text);
    }
  }

  if (x['attachments'] !== undefined && p.arr(x['attachments'], 'attachments')) {
    x['attachments'].forEach((a, i) => checkAttachment(p, a, x['id'], `attachments[${i}]`));
  }

  if (x['styleEdits'] !== undefined && p.arr(x['styleEdits'], 'styleEdits')) {
    x['styleEdits'].forEach((e, i) => checkStyleEdit(p, e, `styleEdits[${i}]`));
  }

  if (x['anchorState'] !== undefined) {
    p.oneOf(x['anchorState'], ['exact', 'moved', 'lost'] as const, 'anchorState');
  }

  if (status === 'draft' && x['batch'] !== null) p.add('batch: must be null while draft');
  if (status === 'review' && x['resolvedAt'] === null) {
    p.add('resolvedAt: required once the status is review');
  }
  if (status === 'approved' && x['approvedAt'] === null) {
    p.add('approvedAt: required once the status is approved');
  }

  return p.list;
}

export function isAnnotation(x: unknown): x is Annotation {
  return validateAnnotation(x).length === 0;
}

/** Every problem with `x` as a Batch; empty when it is valid. */
export function validateBatch(x: unknown): string[] {
  const p = new Problems();
  if (!p.rec(x, 'batch')) return p.list;
  p.id(x['id'], 'id');
  if (p.str(x['route'], 'route') && !(x['route'] as string).startsWith('/')) {
    p.add('route: must start with /');
  }
  if (p.arr(x['annotationIds'], 'annotationIds')) {
    x['annotationIds'].forEach((v, i) => p.id(v, `annotationIds[${i}]`));
  }
  if (x['summary'] !== null) p.capped(x['summary'], 'summary', LIMITS.text);
  if (x['questions'] !== undefined) p.oneOf(String(x['questions']), ['0', '1', '2', '3'], 'questions');
  p.iso(x['sentAt'], 'sentAt');
  return p.list;
}

export function isBatch(x: unknown): x is Batch {
  return validateBatch(x).length === 0;
}

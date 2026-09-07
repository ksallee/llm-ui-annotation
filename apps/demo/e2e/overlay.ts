import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Annotation, RouteFile } from '@llm-ui-annotation/core';
import { expect, type Locator, type Page } from '@playwright/test';

export type Mode = 'Element' | 'Highlight' | 'Draw';

const STATE_MODE: Record<Mode, string> = { Element: 'element', Highlight: 'text', Draw: 'page' };

export interface Snapshot {
  route: string;
  connection: string;
  mode: string | null;
  ready: boolean;
  badge: number;
  counts: Record<string, number>;
  annotations: Annotation[];
  toasts: string[];
  chip: { enabled: boolean; reason: string } | null;
}

export const overlay = (page: Page): Locator => page.locator('annot-overlay');

const control = (page: Page, label: string): Locator =>
  overlay(page).locator(`[aria-label="${label}"]`);

/** Wait until the overlay has mounted, hydrated and reached the dev server. */
export async function ready(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('annot-overlay') as { state?: { ready?: boolean } } | null;
        return el?.state?.ready === true;
      },
      undefined,
      { timeout: 15_000 },
    );
  } catch (error) {
    const why = await page.evaluate(() => {
      const el = document.querySelector('annot-overlay') as {
        state?: { ready?: boolean; connection?: string };
      } | null;
      return {
        url: location.href,
        mounted: el !== null,
        connection: el?.state?.connection ?? null,
        body: document.body?.childElementCount ?? -1,
      };
    });
    throw new Error(`the overlay never became ready: ${JSON.stringify(why)}`, { cause: error });
  }
}

export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const el = document.querySelector('annot-overlay') as { state?: Record<string, never> } | null;
    const s = el?.state as unknown as Record<string, never>;
    const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    return {
      route: s['route'],
      connection: s['connection'],
      mode: s['mode'] ?? null,
      ready: s['ready'],
      badge: s['badge'],
      counts: plain(s['counts']),
      annotations: plain([...(s['annotations'] as unknown as Map<string, never>).values()]),
      toasts: (s['toasts'] as unknown as { text: string }[]).map((t) => t.text),
      chip: s['textChip']
        ? plain({
            enabled: (s['textChip'] as unknown as { enabled: boolean }).enabled,
            reason: (s['textChip'] as unknown as { reason: string }).reason,
          })
        : null,
    } as never;
  });
}

/** Read a state field the snapshot does not carry. */
export function field<T>(page: Page, path: string): Promise<T> {
  return page.evaluate((key) => {
    const el = document.querySelector('annot-overlay') as { state?: Record<string, unknown> } | null;
    const value = key.split('.').reduce<unknown>((acc, part) => {
      return acc === null || acc === undefined ? acc : (acc as Record<string, unknown>)[part];
    }, el?.state);
    return JSON.parse(JSON.stringify(value ?? null)) as T;
  }, path);
}

export async function openToolbar(page: Page): Promise<void> {
  await ready(page);
  const pill = control(page, 'Open the annotation toolbar');
  if (await pill.isVisible()) await pill.click();
  await expect(control(page, 'Element mode')).toBeVisible();
}

export async function setMode(page: Page, mode: Mode): Promise<void> {
  await openToolbar(page);
  await control(page, `${mode} mode`).click();
  await expect.poll(() => field<string | null>(page, 'mode')).toBe(STATE_MODE[mode]);
}

export async function exitMode(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect.poll(() => field<string | null>(page, 'mode')).toBeNull();
}

/** Centre of a host element, in viewport coordinates, scrolled into view first. */
export async function centre(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The capture layer swallows synthetic clicks, so every host click is real mouse input. */
export async function pointAt(page: Page, selector: string): Promise<void> {
  const at = await centre(page, selector);
  await page.mouse.move(at.x, at.y);
}

export async function clickHost(page: Page, selector: string): Promise<void> {
  const at = await centre(page, selector);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
}

/** 1×1 PNG, real enough for the server's magic-byte sniff. */
export const PNG_FILE =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Drag a file over a target inside the shadow root and drop it there. */
export async function dropFile(
  page: Page,
  target: Locator,
  name: string,
  type: string,
  base64: string,
): Promise<void> {
  const transfer = await page.evaluateHandle(
    ({ name, type, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type }));
      return data;
    },
    { name, type, base64 },
  );
  await target.dispatchEvent('dragenter', { dataTransfer: transfer });
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
}

export async function marquee(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

export const popup = (page: Page): Locator => overlay(page).locator('.card.popup');

/**
 * Select a host element and open its popup. With the drawer on Inspect a click only selects, so the
 * note comes from the Annotate chip.
 */
export async function annotate(page: Page, selector: string): Promise<void> {
  await clickHost(page, selector);
  if (await popup(page).isVisible()) return;
  await overlay(page).locator('.chip', { hasText: 'Annotate' }).first().click();
  await expect(popup(page)).toBeVisible();
}

/** Type a comment into the open popup and press the primary button. */
export async function commit(page: Page, comment: string): Promise<void> {
  const card = popup(page);
  await expect(card).toBeVisible();
  await card.locator('textarea.field').fill(comment);
  await card.locator('button.primary').click();
  await expect(card).toBeHidden();
}

export async function annotateElement(page: Page, selector: string, comment: string): Promise<void> {
  await clickHost(page, selector);
  await commit(page, comment);
}

export async function sendBatch(page: Page, summary = ''): Promise<void> {
  const send = overlay(page).locator('button.send-btn');
  await send.click();
  const dialog = overlay(page).locator('[aria-label="Send annotations"]');
  await expect(dialog).toBeVisible();
  if (summary) await dialog.locator('textarea.field').fill(summary);
  await dialog.locator('button.primary').click();
  await expect(dialog).toBeHidden();
}

export const panel = (page: Page): Locator => overlay(page).locator('[aria-label="Annotations"]');

export async function openPanel(page: Page): Promise<void> {
  await openToolbar(page);
  const drawer = panel(page);
  if (!(await drawer.isVisible())) {
    await control(page, 'Toggle the annotations panel').click();
  }
  await expect(drawer).toBeVisible();
}

export async function openSettings(page: Page): Promise<Locator> {
  await openToolbar(page);
  await control(page, 'Settings').click();
  const popover = overlay(page).locator('[aria-label="Overlay settings"]');
  await expect(popover).toBeVisible();
  return popover;
}

/** The panel row for `#number`, expanded. */
export async function expandRow(page: Page, number: number): Promise<Locator> {
  await openPanel(page);
  const row = panel(page).locator('.entry', { has: page.locator(`text="#${number}"`) }).first();
  const head = row.locator('button.head');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  return row;
}

/** Where the overlay currently thinks an annotation lives. */
export function anchorOf(
  page: Page,
  id: string,
): Promise<{ state: string; rects: { x: number; y: number; width: number; height: number }[] } | null> {
  return page.evaluate((key) => {
    const el = document.querySelector('annot-overlay') as {
      state?: { anchorOf(id: string): unknown };
    } | null;
    return JSON.parse(JSON.stringify(el?.state?.anchorOf(key) ?? null)) as never;
  }, id);
}

/** Select a run of host text by index of the occurrence, as a real document selection. */
export async function selectPhrase(
  page: Page,
  container: string,
  phrase: string,
  occurrence = 1,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(
    ({ container, phrase, occurrence }) => {
      const host = document.querySelector(container);
      if (!host) throw new Error(`no container ${container}`);
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue ?? '';
        let from = text.indexOf(phrase);
        while (from !== -1) {
          seen += 1;
          if (seen === occurrence) {
            const range = document.createRange();
            range.setStart(node, from);
            range.setEnd(node, from + phrase.length);
            const selection = document.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            const box = range.getBoundingClientRect();
            return {
              x: box.x + window.scrollX,
              y: box.y + window.scrollY,
              width: box.width,
              height: box.height,
            };
          }
          from = text.indexOf(phrase, from + 1);
        }
      }
      throw new Error(`occurrence ${occurrence} of "${phrase}" not found`);
    },
    { container, phrase, occurrence },
  );
}

// -------------------------------------------------------------------- storage

export async function routeFile(dir: string, route: string): Promise<RouteFile | null> {
  const files = await readdir(join(dir, 'routes')).catch(() => [] as string[]);
  for (const name of files) {
    const parsed = JSON.parse(await readFile(join(dir, 'routes', name), 'utf8')) as RouteFile;
    if (parsed.route === route) return parsed;
  }
  return null;
}

export async function storedAnnotations(dir: string, route: string): Promise<Annotation[]> {
  return (await routeFile(dir, route))?.annotations ?? [];
}

// --------------------------------------------------------------------- theme

/** A token from the shadow root, as the browser resolves it. */
export function token(page: Page, name: string): Promise<string> {
  return page.evaluate((key) => {
    const host = document.querySelector('annot-overlay') as HTMLElement;
    const root = host.shadowRoot!.querySelector('.annot-root') as HTMLElement;
    return getComputedStyle(root).getPropertyValue(key).trim();
  }, name);
}

/** Any CSS colour as sRGB, resolved by the browser's own canvas parser. */
export function toRgb(page: Page, color: string): Promise<[number, number, number]> {
  return page.evaluate((value) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, color);
}

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = ([r, g, b]: [number, number, number]): number =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** The `::highlight()` rules the overlay puts in the host head. */
export function highlightStyle(page: Page): Promise<string> {
  return page.evaluate(
    () => document.head.querySelector('style[data-annot-highlights]')?.textContent ?? '',
  );
}

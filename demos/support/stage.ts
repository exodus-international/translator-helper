import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { DEMO_VIEWPORT } from '../playwright.config';
import { SEED_PASSWORD } from '../../e2e/support/identities';

export const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

/**
 * A headless recording has no pointer, so a viewer cannot tell what was
 * clicked. This draws one, follows real mouse events, and pulses on press.
 */
const CURSOR_SCRIPT = `
(() => {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  const install = () => {
    const cursor = document.createElement('div');
    cursor.id = '__demo-cursor';
    cursor.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2l14 10.5-6.2 1.1 3.9 7.4-2.9 1.5-3.9-7.5L4 19.5z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', width: '24px', height: '24px', zIndex: '2147483647',
      pointerEvents: 'none', transform: 'translate(-100px, -100px)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))',
    });
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position: 'fixed', left: '0', top: '0', width: '28px', height: '28px', margin: '-14px 0 0 -14px',
      borderRadius: '50%', background: 'rgba(59,130,246,.35)', zIndex: '2147483646', pointerEvents: 'none',
      opacity: '0', transition: 'opacity .35s, transform .35s',
    });
    // The Next.js dev-tools badge sits over the user menu; it is not the product.
    const hide = document.createElement('style');
    hide.textContent = 'nextjs-portal { display: none !important; }';
    document.documentElement.append(hide, ring, cursor);
    const at = { x: -100, y: -100 };
    window.addEventListener('mousemove', (e) => {
      at.x = e.clientX; at.y = e.clientY;
      cursor.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)';
    }, true);
    window.addEventListener('mousedown', () => {
      ring.style.transition = 'none';
      ring.style.transform = 'translate(' + at.x + 'px,' + at.y + 'px) scale(.4)';
      ring.style.opacity = '1';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ring.style.transition = 'opacity .45s, transform .45s';
        ring.style.transform = 'translate(' + at.x + 'px,' + at.y + 'px) scale(1.3)';
        ring.style.opacity = '0';
      }));
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
`;

export interface Scene {
  page: Page;
  context: BrowserContext;
  /** Marks where the GIF begins; everything before it (sign-in, loading) is trimmed. */
  action(): void;
  /** Saves the video and the trim point. */
  cut(): Promise<void>;
}

/**
 * Opens a recorded browser context, signs in as `email`, and hands the page to
 * the scene. The video starts with the context; `action()` records how far in
 * the scene proper begins.
 */
export async function stage(browser: Browser, name: string, email: string): Promise<Scene> {
  const rawDir = path.join(OUTPUT_DIR, '.raw', name);
  fs.rmSync(rawDir, { recursive: true, force: true });

  const context = await browser.newContext({
    viewport: DEMO_VIEWPORT,
    recordVideo: { dir: rawDir, size: DEMO_VIEWPORT },
    baseURL: process.env.DEMO_URL || 'http://localhost:3300',
    // Keeps the app's light theme regardless of the machine running this.
    colorScheme: 'light',
    // "Copy all" writes to the clipboard, which a headless page must be granted.
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const recordingStarted = Date.now();
  let actionAt = 0;

  await signIn(page, email);

  return {
    page,
    context,
    action() {
      actionAt = (Date.now() - recordingStarted) / 1000;
    },
    async cut() {
      await page.waitForTimeout(400);
      const video = page.video();
      await context.close();
      if (!video) throw new Error('No video was recorded');
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      await video.saveAs(path.join(OUTPUT_DIR, `${name}.webm`));
      fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), JSON.stringify({ trimStart: actionAt }, null, 2));
      fs.rmSync(rawDir, { recursive: true, force: true });
    },
  };
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(/\/(dashboard|onboarding\/profile)/, { timeout: 60_000 });
  if (page.url().includes('/onboarding/profile')) {
    await page.getByRole('button', { name: 'Continue to Dashboard' }).click();
    await page.waitForURL('**/dashboard');
  }
}

// --- Moving like a person -----------------------------------------------------

const positions = new WeakMap<Page, { x: number; y: number }>();

/** Moves the pointer to a point along an eased path, so the viewer can follow it. */
export async function glideTo(page: Page, x: number, y: number, duration = 650) {
  const from = positions.get(page) ?? { x: DEMO_VIEWPORT.width / 2, y: DEMO_VIEWPORT.height - 60 };
  const steps = Math.max(8, Math.round(duration / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
    await page.waitForTimeout(duration / steps);
  }
  positions.set(page, { x, y });
}

async function centreOf(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Not visible: ${locator}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

export async function hover(page: Page, locator: Locator, duration?: number) {
  const { x, y } = await centreOf(locator);
  await glideTo(page, x, y, duration);
}

export async function click(page: Page, locator: Locator, duration?: number) {
  await hover(page, locator, duration);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
}

/** Drags across a stretch of text, the way someone selects a phrase. */
export async function selectBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await glideTo(page, from.x, from.y);
  await page.mouse.down();
  await glideTo(page, to.x, to.y, 700);
  await page.mouse.up();
}

/**
 * Where a phrase sits on screen inside `container`: the left edge of its first
 * character and the right edge of its last, on the phrase's own line.
 */
export async function phraseBounds(container: Locator, phrase: string) {
  await container.getByText(phrase, { exact: false }).first().scrollIntoViewIfNeeded();
  const rect = await container.evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(text) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const r = range.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }
    return null;
  }, phrase);
  if (!rect) throw new Error(`Phrase not found in a single text node: ${phrase}`);
  const y = (rect.top + rect.bottom) / 2;
  return { start: { x: rect.left + 1, y }, end: { x: rect.right - 1, y } };
}

/** Types at a readable pace rather than all at once. */
export async function typeSlowly(page: Page, text: string, delay = 45) {
  await page.keyboard.type(text, { delay });
}

export const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

/** Stills have no motion to follow, so the drawn pointer only gets in the way. */
export async function hideCursor(page: Page) {
  await page.evaluate(() => document.getElementById('__demo-cursor')?.style.setProperty('display', 'none'));
}

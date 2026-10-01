import { expect, test, type Page } from '@playwright/test';
import { translationPane } from '../e2e/support/editor';
import { click, glideTo, hover, pause, phraseBounds, stage } from './support/stage';

/** The rightmost "Fix all" is the translation pane's; the other is the source's. */
async function translationFixAll(page: Page) {
  const buttons = page.getByRole('button', { name: /^Fix all/ });
  await expect(buttons.first()).toBeVisible();
  let best = buttons.first();
  let bestX = -1;
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    if (box && box.x > bestX) [best, bestX] = [button, box.x];
  }
  return best;
}

test('content checks: spot the problems, fix them in one click', async ({ browser }) => {
  // The seeded markdown reference is deliberately messy in Czech.
  const scene = await stage(browser, 'content-checks', 'translator@example.org');
  const { page } = scene;

  await page.goto('/documents/exodus90/ex90-markdown-reference/cs');
  const pane = translationPane(page);
  await expect(pane).toBeVisible();
  const fixAll = await translationFixAll(page);
  await pause(page, 1200);
  scene.action();

  await pause(page, 600);
  // A translated frontmatter key: the hover card says what is wrong and how to fix it.
  const key = await phraseBounds(pane, 'hrdina');
  await glideTo(page, (key.start.x + key.end.x) / 2, key.start.y);
  await pause(page, 1800);
  // Its own quick fix, from the card.
  await click(page, page.getByRole('button', { name: /Rename to/ }), 500);
  await pause(page, 1500);

  // The status bar counts every finding in the pane.
  await hover(page, fixAll);
  await pause(page, 900);
  await click(page, fixAll, 200);
  await pause(page, 2800);

  await scene.cut();
});

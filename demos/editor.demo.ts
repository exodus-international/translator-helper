import { expect, test, type Locator } from '@playwright/test';
import { translationPane } from '../e2e/support/editor';
import { click, hover, pause, phraseBounds, selectBetween, stage } from './support/stage';

/** Both panes carry the same controls; the translation pane is the one on the right. */
async function rightmost(locator: Locator): Promise<Locator> {
  await expect(locator.first()).toBeVisible();
  let best = locator.first();
  let bestX = -1;
  for (const candidate of await locator.all()) {
    const box = await candidate.boundingBox();
    if (box && box.x > bestX) [best, bestX] = [candidate, box.x];
  }
  return best;
}

test('editor: formatting on the selection, copy all, and the reader preview', async ({ browser }) => {
  // The demo layer leaves this translation nearly finished.
  const scene = await stage(browser, 'editor', 'translator@example.org');
  const { page } = scene;

  await page.goto('/documents/lent2026/lent-day-5/cs');
  const pane = translationPane(page);
  await expect(pane).toBeVisible();
  await pause(page, 1200);
  scene.action();
  await pause(page, 500);

  // Bold, from the toolbar that appears over the selection.
  const sentence = await phraseBounds(pane, 'Pravý půst však přesahuje jídlo.');
  await selectBetween(page, sentence.start, sentence.end);
  await pause(page, 700);
  await click(page, page.getByRole('button', { name: 'Bold', exact: true }), 450);
  await pause(page, 1400);

  // A heading the translation lost: the toolbar shows it pressed once applied.
  const heading = await phraseBounds(pane, 'Dnešní výzva');
  await selectBetween(page, heading.start, heading.end);
  await pause(page, 600);
  await click(page, page.getByRole('button', { name: 'Heading 3', exact: true }), 450);
  await pause(page, 1500);

  // The whole translation, in one click.
  await click(page, await rightmost(page.getByRole('button', { name: /^Copy all/ })));
  await pause(page, 1300);

  // How a reader will meet it.
  await click(page, await rightmost(page.getByRole('tab', { name: 'Preview' })));
  await pause(page, 1200);
  await hover(page, page.getByText('Pravý půst však přesahuje jídlo.').last(), 900);
  await pause(page, 2200);

  await scene.cut();
});

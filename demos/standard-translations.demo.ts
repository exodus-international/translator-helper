import { expect, test } from '@playwright/test';
import { sourcePane, translationPane } from '../e2e/support/editor';
import { click, glideTo, pause, phraseBounds, selectBetween, stage } from './support/stage';

test('standard translations: the team’s wording found, fixed and added from the editor', async ({ browser }) => {
  // The demo layer gives Czech three standard translations and a Day 45 draft
  // that uses two of them and writes the third a word short.
  const scene = await stage(browser, 'standard-translations', 'translator@example.org');
  const { page } = scene;

  await page.goto('/documents/exodus90/ex90-day-45/cs');
  const pane = translationPane(page);
  await expect(pane).toBeVisible();
  const card = page.getByRole('button', { name: /^Standard translations/ }).last();
  await expect(card).toContainText('to check');
  await pause(page, 1200);
  scene.action();
  await pause(page, 500);

  // The panel lists every standard text the source uses, and how the translation has it.
  await click(page, card);
  await expect(page.getByText('1 word differs')).toBeVisible();
  await pause(page, 2200);

  // The heading is a word short of the standard: its card shows the difference.
  const changed = await phraseBounds(pane, 'Večerní zpytování');
  await glideTo(page, (changed.start.x + changed.end.x) / 2, changed.start.y, 800);
  const use = page.getByRole('button', { name: 'Use standard text' });
  await expect(use).toBeVisible();
  await pause(page, 2600);

  // One click writes the team's wording in, keeping the heading's layout.
  await click(page, use);
  await expect(pane).toContainText('Večerní zpytování svědomí');
  await pause(page, 2000);

  // Selecting source text starts a new entry, its translation taken from the same line.
  const source = sourcePane(page);
  const heading = await phraseBounds(source, 'Look Back and Look Forward');
  await selectBetween(page, heading.start, heading.end);
  const add = page.getByRole('button', { name: 'Add standard translation' });
  await expect(add).toBeVisible();
  await pause(page, 900);
  await click(page, add);
  await expect(page.getByText(/Taken from line 9 of the translation/)).toBeVisible();
  await pause(page, 3200);

  await scene.cut();
});

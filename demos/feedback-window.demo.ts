import { expect, test } from '@playwright/test';
import { translationPane } from '../e2e/support/editor';
import { suggestionWindow } from '../e2e/support/floating-window';
import { click, glideTo, pause, phraseBounds, selectBetween, stage, typeSlowly } from './support/stage';

test('feedback window: drag it off the text it is about', async ({ browser }) => {
  const scene = await stage(browser, 'feedback-window', 'reviewer@example.org');
  const { page } = scene;

  await page.goto('/documents/exodus90/ex90-day-1/hr');
  const pane = translationPane(page);
  await expect(pane).toBeVisible();
  await pause(page, 1200);
  scene.action();
  await pause(page, 500);

  const phrase = await phraseBounds(pane, 'ucinit cu vas');
  await selectBetween(page, phrase.start, phrase.end);
  await pause(page, 600);
  await click(page, page.getByRole('button', { name: 'Suggest edit' }), 450);

  // The window opens over the pane, on top of the passage.
  const window = suggestionWindow(page);
  await expect(window).toBeVisible();
  await pause(page, 1300);

  // Picked up by its title bar and set down beside the text.
  const handle = await window.getByRole('group', { name: /^Move .+ window$/ }).boundingBox();
  if (!handle) throw new Error('The suggestion window has no drag handle.');
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await glideTo(page, from.x, from.y);
  await pause(page, 200);
  await page.mouse.down();
  await glideTo(page, from.x - 430, from.y + 330, 1100);
  await page.mouse.up();
  await pause(page, 1100);

  await click(page, window.getByLabel('Comment'));
  await typeSlowly(page, 'Nedostaju dijakritički znakovi.', 35);
  await click(page, window.getByLabel('Proposed replacement'));
  // The field opens holding the selected text; the replacement takes its place.
  await page.keyboard.press('ControlOrMeta+a');
  await pause(page, 300);
  await typeSlowly(page, 'učinit ću vas', 35);
  await pause(page, 700);
  await click(page, window.getByRole('button', { name: 'Save' }));
  await pause(page, 2400);

  await scene.cut();
});

import { expect, test } from '@playwright/test';
import { click, glideTo, pause, stage, typeSlowly } from './support/stage';

test('bible admin: the imported Bibles, a translation, and resolving a reference', async ({ browser }) => {
  const scene = await stage(browser, 'bible-admin', 'admin@example.org');
  const { page } = scene;

  await page.goto('/admin/bible');
  const saric = page.getByRole('link', { name: /Šarić/ });
  await expect(saric).toBeVisible();
  await pause(page, 1000);
  scene.action();
  await pause(page, 1500);

  // The name wraps in its cell, so the middle of the link's box is not on the
  // link: aim at its first words.
  const name = await saric.boundingBox();
  if (!name) throw new Error('The translation link has no position.');
  await glideTo(page, name.x + 60, name.y + 10);
  await pause(page, 150);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'Books' })).toBeVisible({ timeout: 30_000 });
  await pause(page, 1800);

  // Where Croatian numbers a chapter differently from RSV-CE.
  await click(page, page.getByRole('tab', { name: 'Versification' }));
  await pause(page, 2400);

  // Any reference, resolved the way a translation will resolve it.
  await click(page, page.getByRole('tab', { name: 'Try it' }));
  await click(page, page.getByRole('textbox', { name: 'References' }));
  await typeSlowly(page, 'Ps 46:10');
  await page.keyboard.press('Enter');
  await typeSlowly(page, 'John 3:16');
  await pause(page, 400);
  await click(page, page.getByRole('button', { name: 'Resolve' }));
  await expect(page.getByText('cited as').first()).toBeVisible({ timeout: 30_000 });
  await pause(page, 3200);

  await scene.cut();
});

import { expect, test } from '@playwright/test';
import { click, pause, stage, typeSlowly } from './support/stage';

test('bible chat: ask for a passage and copy it with its citation', async ({ browser }) => {
  // Needs CHATGPT_API on the demo server: the assistant picks the passages,
  // and their text comes from the imported Bible.
  const scene = await stage(browser, 'bible-chat', 'translator@example.org');
  const { page } = scene;

  await page.goto('/dashboard');
  await expect(page.getByText('My Projects')).toBeVisible();
  await pause(page, 800);
  scene.action();
  await pause(page, 400);

  await click(page, page.getByRole('link', { name: 'Bible', exact: true }));
  const question = page.getByRole('textbox', { name: 'Question about the Bible' });
  await expect(question).toBeVisible();
  await pause(page, 1200);

  await click(page, question);
  await typeSlowly(page, 'What does John 3:16 say?');
  await pause(page, 400);
  await click(page, page.getByRole('button', { name: 'Send' }), 400);

  const copy = page.getByRole('button', { name: /^Copy .+ with its citation$/ }).first();
  await expect(copy).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 60_000 });
  await pause(page, 2200);
  await click(page, copy);
  await pause(page, 2200);

  await scene.cut();
});

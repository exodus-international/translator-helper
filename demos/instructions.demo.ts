import { expect, test } from '@playwright/test';
import { click, pause, stage, typeSlowly } from './support/stage';

test('AI instructions: a Language Manager writes, the prompt updates live', async ({ browser }) => {
  // Maria Schmidt manages German and is not an administrator.
  const scene = await stage(browser, 'instructions', 'translator2@example.org');
  const { page } = scene;

  await page.goto('/instructions?lang=de');
  const textarea = page.getByRole('textbox').first();
  await expect(textarea).toBeVisible();
  await expect(page.getByText('What the AI actually receives')).toBeVisible();
  await pause(page, 1200);
  scene.action();
  await pause(page, 700);

  await click(page, textarea, 800);
  // Cmd+End does not reach the end of a textarea on macOS, so place the caret directly.
  await textarea.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  await pause(page, 300);
  await typeSlowly(page, ' Translate "brother" as "Bruder", never "Kollege".', 38);
  await pause(page, 1500);

  // The base prompt the instructions are appended to, which nobody used to see.
  await click(page, page.getByText(/^Base prompt/).first(), 800);
  await pause(page, 2200);

  await click(page, page.getByRole('button', { name: 'Save', exact: true }), 800);
  await pause(page, 2200);

  await scene.cut();
});

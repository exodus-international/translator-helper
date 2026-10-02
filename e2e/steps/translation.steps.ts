import { expect } from '@playwright/test';
import type { DocumentStatus } from '@/generated/prisma/enums';
import { Given, When, Then } from './fixtures';
import { openDocument } from '../support/documents';
import { changeStatus, expectStatus, currentStatus } from '../support/status';
import {
  openFindFromKeyboard,
  openReplaceFromKeyboard,
  replaceAllInTranslation,
  replaceTranslation,
  sourcePane,
  translationText,
  waitForTranslationPane,
} from '../support/editor';
import { statusName } from '../support/status';

Given('I open {string} in {word}', async ({ page }, title: string, language: string) => {
  await openDocument(page, title, language);
});

Given('the translation has been started', async ({ page }) => {
  // Written as a precondition rather than an assertion: a scenario about
  // saving should not fail because the document happened to be left in a
  // different state.
  if ((await currentStatus(page)) === statusName('PENDING_TRANSLATION' as DocumentStatus)) {
    await changeStatus(page, 'Start translation');
  }
  await waitForTranslationPane(page);
});

When('I start the translation', async ({ page }) => {
  await changeStatus(page, 'Start translation');
});

When('I write {string} as the translation', async ({ page }, text: string) => {
  await replaceTranslation(page, text);
});

When(
  'I replace every {string} with {string} in the translation',
  async ({ page }, find: string, replacement: string) => {
    await replaceAllInTranslation(page, find, replacement);
  },
);

When('I press the find shortcut in the translation', async ({ page }) => {
  await openFindFromKeyboard(page);
});

Then('I should be offered find without replace', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Find' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Replace' })).toBeHidden();
});

When('I press the replace shortcut in the translation', async ({ page }) => {
  await openReplaceFromKeyboard(page);
});

Then('the replace field should have the cursor', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Replace' })).toBeFocused();
});

When('I press the replace shortcut in the source text', async ({ page }) => {
  const pane = sourcePane(page);
  await pane.click();
  await expect(pane).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Alt+f');
});

Then('I should be told that replace is not available there', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Find' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Replace' })).toHaveCount(0);
  await expect(page.getByText('replace is not available')).toBeVisible();
});

When('I save the translation', async ({ page }) => {
  await page.getByRole('button', { name: 'Save' }).click();
});

When('I submit the translation for review', async ({ page }) => {
  await changeStatus(page, 'Give me feedback');
  await page.getByRole('button', { name: 'Submit for Review' }).click();
});

When('I reload the page', async ({ page }) => {
  await page.reload();
});

Then('its status should be {string}', async ({ page }, status: string) => {
  await expectStatus(page, status as DocumentStatus);
});

Then('I should see that my work is saved', async ({ page }) => {
  // The control stops being a button once the save lands.
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

Then('the translation should read {string}', async ({ page }, text: string) => {
  await waitForTranslationPane(page);
  await expect
    .poll(() => translationText(page), { message: 'translation did not persist' })
    .toContain(text);
});

When('I ask the AI to translate', async ({ page }) => {
  await page.getByRole('button', { name: 'AI translate' }).click();
  // The button renames itself while the request is in flight and back when it
  // settles, which is the app's own signal that the draft has landed.
  await expect(page.getByRole('button', { name: 'AI translate' })).toBeVisible({ timeout: 30_000 });
});

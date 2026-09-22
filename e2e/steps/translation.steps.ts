import { expect } from '@playwright/test';
import type { DocumentStatus } from '@/generated/prisma/enums';
import { Given, When, Then } from './fixtures';
import { openDocument } from '../support/documents';
import { changeStatus, expectStatus, currentStatus } from '../support/status';
import { replaceTranslation, translationText, waitForTranslationPane } from '../support/editor';
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

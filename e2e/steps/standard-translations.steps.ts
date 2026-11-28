import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import {
  addStandardTranslation,
  changeStandardTranslation,
  entryRow,
  languageTab,
  openStandardTranslations,
} from '../support/standard-translations';

Given('I open the standard translations', async ({ page }) => {
  await openStandardTranslations(page);
});

Given('I open the standard translations for {word}', async ({ page }, language: string) => {
  await openStandardTranslations(page, language);
});

When(
  'I add the standard translation {string} of {string} as {string}',
  async ({ page }, name: string, source: string, translation: string) => {
    await addStandardTranslation(page, { name, source, translation });
  },
);

When(
  'I change the standard translation {string} to {string}',
  async ({ page }, name: string, translation: string) => {
    await changeStandardTranslation(page, name, translation);
  },
);

Then(
  'the standard translation {string} should read {string}',
  async ({ page }, name: string, translation: string) => {
    await expect(entryRow(page, name)).toContainText(translation);
  },
);

Then('there should be a {string} tab', async ({ page }, language: string) => {
  await expect(languageTab(page, language)).toBeVisible();
});

Then('there should be no {string} tab', async ({ page }, language: string) => {
  await expect(languageTab(page, language)).toHaveCount(0);
});

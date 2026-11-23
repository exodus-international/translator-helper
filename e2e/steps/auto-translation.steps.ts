import { expect, type Page } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import { languageCode } from '../support/documents';
import { replaceTranslation, waitForTranslationPane } from '../support/editor';

function card(page: Page) {
  return page.getByTestId('auto-translation-card');
}

Given('I open the {string} project in {word}', async ({ page }, slug: string, language: string) => {
  await page.goto(`/projects/${slug}?lang=${languageCode(language)}`);
  await expect(card(page)).toBeVisible();
});

When('I turn on AI translation for {int} document(s)', async ({ page }, count: number) => {
  const toggle = card(page).getByRole('switch', { name: 'AI translation' });
  await expect(toggle).not.toBeChecked();
  await toggle.click();

  // The confirmation says how many documents it will draft before anything starts.
  const dialog = page.getByRole('alertdialog', { name: /Turn on AI translation/ });
  await expect(dialog).toBeVisible();
  const label = count === 1 ? '1 document' : `${count} documents`;
  await expect(dialog).toContainText(`draft ${label}`);
  await dialog.getByRole('button', { name: `Translate ${label}` }).click();

  await expect(toggle).toBeChecked();
});

Then('AI translation should report {int} of {int} translated', async ({ page }, done: number, total: number) => {
  // The worker drafts in the background; the card polls until it is done.
  await expect(card(page).getByText(`${done} of ${total} translated`)).toBeVisible({ timeout: 45_000 });
  await expect(card(page).getByText('Done', { exact: true })).toBeVisible();
});

Then('{string} should be marked as AI-translated on the board', async ({ page }, title: string) => {
  // The board reloads when the card sees a new draft land.
  const onBoard = page.getByRole('link').filter({ hasText: title }).filter({ hasText: 'AI-translated' });
  await expect(onBoard.first()).toBeVisible({ timeout: 15_000 });
});

Then('the translation should be marked as AI-translated', async ({ page }) => {
  await expect(page.getByText('AI-translated', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Changes from AI' })).toBeVisible();
});

When('I edit the translation in review to read {string}', async ({ page }, text: string) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await waitForTranslationPane(page);
  await replaceTranslation(page, text);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Changes saved successfully!')).toBeVisible();
});

Then(
  'the changes from the AI draft should show {string} replaced by {string}',
  async ({ page }, original: string, edited: string) => {
    await page.getByRole('tab', { name: 'Changes from AI' }).click();
    const diff = page.locator('.cm-mergeView');
    await expect(diff).toBeVisible();
    await expect(diff).toContainText(original);
    await expect(diff).toContainText(edited);
  },
);

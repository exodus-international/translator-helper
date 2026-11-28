import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Drives the Standard translations page and its add/edit dialog.
 *
 * Languages are tabs and entries are table rows named by their text, so both
 * are reached by role. The translation field is the app's code editor, a
 * textbox named after the language, typed into from the keyboard for the
 * reason `editor.ts` gives.
 */

export async function openStandardTranslations(page: Page, language?: string) {
  await page.goto('/standard-translations');
  await expect(page.getByRole('heading', { name: 'Standard translations' })).toBeVisible();
  if (language) {
    const tab = languageTab(page, language);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
}

export function languageTab(page: Page, language: string): Locator {
  return page.getByRole('tab', { name: language, exact: true });
}

export function entryRow(page: Page, name: string): Locator {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
}

/** Replaces the whole translation in the dialog's editor. */
async function typeTranslation(dialog: Locator, text: string) {
  const editor = dialog.getByRole('textbox', { name: /^Standard translation · / });
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.page().keyboard.press('ControlOrMeta+a');
  await editor.page().keyboard.type(text);
}

async function save(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Save standard translation' }).click();
  // Closing is what says it saved: an error keeps the dialog open and says why.
  await expect(dialog).toBeHidden();
}

export async function addStandardTranslation(
  page: Page,
  entry: { name: string; source: string; translation: string },
) {
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add standard translation' });
  await dialog.getByLabel(/^Name/).fill(entry.name);
  await dialog.getByLabel('Source · English').fill(entry.source);
  await typeTranslation(dialog, entry.translation);
  await save(dialog);
}

export async function changeStandardTranslation(page: Page, name: string, translation: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit standard translation' });
  await typeTranslation(dialog, translation);
  await save(dialog);
}

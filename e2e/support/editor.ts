import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Drives the translation and source panes.
 *
 * This is the only module that knows which editor library the app uses. The
 * previous attempt at this suite spread those details across its step files
 * and did not survive the move from Monaco to CodeMirror. Keeping them here
 * means the next such change is one file.
 *
 * Both panes are plain textboxes with accessible names, so they are reached
 * the way any other form control is.
 */
export function translationPane(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Translation' });
}

export function sourcePane(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Source text' });
}

export async function waitForTranslationPane(page: Page) {
  await expect(translationPane(page)).toBeVisible();
}

export async function translationText(page: Page): Promise<string> {
  return (await translationPane(page).innerText()).trim();
}

/**
 * Replaces the whole translation.
 *
 * The content element is genuinely editable, so selecting all and typing is
 * enough. `fill()` is avoided: CodeMirror renders only the visible lines, so
 * setting the value wholesale can drop content the view has not built yet.
 */
export async function replaceTranslation(page: Page, text: string) {
  const pane = translationPane(page);
  await pane.click();
  await expect(pane).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

/** Opens replace with the key the previous editor used for it. */
export async function openReplaceFromKeyboard(page: Page) {
  const pane = translationPane(page);
  await pane.click();
  await expect(pane).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Alt+f');
}

/**
 * Replaces every match through the editor's own find panel, opened the way a
 * translator opens it: from the keyboard, with the cursor in the pane.
 */
export async function replaceAllInTranslation(page: Page, find: string, replacement: string) {
  const pane = translationPane(page);
  await pane.click();
  await expect(pane).toBeFocused();
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByRole('textbox', { name: 'Find' }).fill(find);
  await page.getByRole('textbox', { name: 'Replace' }).fill(replacement);
  await page.getByRole('button', { name: 'replace all' }).click();
}

/** Puts the cursor on a line and selects it, which is what reveals the
 * selection toolbar the suggestion flow starts from. */
export async function selectTranslationLine(page: Page, line: number) {
  const pane = translationPane(page);
  await pane.click();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 1; i < line; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
}

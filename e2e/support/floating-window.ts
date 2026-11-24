import type { Locator, Page } from '@playwright/test';

/**
 * The floating box a comment or suggestion is written in.
 *
 * It is a dialog named after the kind of feedback it collects, with a title
 * bar that doubles as a drag handle. Only this module knows that.
 */
export function suggestionWindow(page: Page): Locator {
  return page.getByRole('dialog', { name: /^(Comment|Suggest edit)$/ });
}

export async function suggestionWindowBox(page: Page) {
  const box = await suggestionWindow(page).boundingBox();
  if (!box) throw new Error('The suggestion window has no position.');
  return box;
}

/** Picks the window up by its title bar and drops it `dx`/`dy` further on. */
export async function dragSuggestionWindow(page: Page, dx: number, dy: number) {
  const handle = suggestionWindow(page).getByRole('group', { name: /^Move .+ window$/ });
  const box = await handle.boundingBox();
  if (!box) throw new Error('The suggestion window has no drag handle.');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

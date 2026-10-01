import { expect, type Page } from '@playwright/test';
import { DOCUMENT_STATUS_CONFIGS } from '@/constants/document-status';
import type { DocumentStatus } from '@/generated/prisma/enums';

/**
 * Drives the document status control.
 *
 * The display names come from the application's own constants rather than
 * being copied here. They have already been renamed once -- "Texts in Review"
 * became "In Review" -- and a copy would have gone stale silently, failing as
 * a timeout that says nothing about the real cause.
 */
export function statusName(status: DocumentStatus): string {
  return DOCUMENT_STATUS_CONFIGS[status].name;
}

/**
 * The control is named for what it does, with the status inside the name, so
 * one locator finds it whatever the document's status happens to be.
 */
function trigger(page: Page) {
  return page.getByRole('button', { name: /^Document status:/ });
}

export async function currentStatus(page: Page): Promise<string> {
  const name = await trigger(page).getAttribute('aria-label');
  return (name ?? '').replace(/^Document status:\s*/, '');
}

export async function expectStatus(page: Page, status: DocumentStatus) {
  await expect(trigger(page)).toHaveAttribute(
    'aria-label',
    `Document status: ${statusName(status)}`,
  );
}

/**
 * Opens the status menu.
 *
 * The control renders as a plain button until React hydrates and only then
 * takes ownership of a menu, so a click that lands before that does nothing at
 * all -- silently, with no error. Waiting for the popup relationship to appear
 * is the difference between a reliable step and one that fails as an
 * unexplained timeout on a slow machine.
 */
export async function openStatusMenu(page: Page) {
  const control = trigger(page);
  await expect(control).toHaveAttribute('aria-haspopup', 'menu');
  await control.click();
  await expect(control).toHaveAttribute('aria-expanded', 'true');
}

/**
 * Moves the document by picking the action that performs the transition.
 *
 * The menu items are labelled by intent ("Start translation", "Approve"),
 * not by target status, which is why this takes the action's wording.
 */
export async function changeStatus(page: Page, action: string) {
  await openStatusMenu(page);
  await page.getByRole('menuitem', { name: action }).click();
}

/** What the menu offers, for the permission scenarios. */
export async function statusActions(page: Page): Promise<string[]> {
  await openStatusMenu(page);
  const items = await page.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return items.map((text) => text.trim()).filter(Boolean);
}

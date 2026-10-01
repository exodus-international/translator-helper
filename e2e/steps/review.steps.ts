import { expect } from '@playwright/test';
import { When, Then } from './fixtures';
import { changeStatus, openStatusMenu } from '../support/status';
import { applyThread, dismissThread, showResolved, openThreadCount, reopenThread, threadContaining, waitForFeedback } from '../support/threads';

// Steps match on their wording, not on the keyword, so this one definition
// serves both the `Then` that asserts it and the `And` that relies on it.
Then('there should be open feedback', async ({ page }) => {
  await waitForFeedback(page);
  expect(await openThreadCount(page)).toBeGreaterThan(0);
});

Then('there should be no open feedback', async ({ page }) => {
  await waitForFeedback(page);
  expect(await openThreadCount(page)).toBe(0);
});

When('I look at the status actions', async ({ page }) => {
  // Opening the menu is the observation; the assertion follows.
  await openStatusMenu(page);
});

Then('approving should be offered but not allowed', async ({ page }) => {
  const approve = page.getByRole('menuitem', { name: 'Approve' });
  await expect(approve).toBeVisible();
  await expect(approve).toBeDisabled();
  // The reviewer is told why, not just refused.
  await expect(approve).toContainText(/open comment/i);
});

When('I apply the suggestion proposing {string}', async ({ page }, proposed: string) => {
  await applyThread(page, proposed);
});

When('I approve the translation', async ({ page }) => {
  await changeStatus(page, 'Approve');
});

When('I dismiss the comment mentioning {string}', async ({ page, world }, text: string) => {
  world.openBefore = String(await openThreadCount(page));
  await dismissThread(page, text);
});

Then('the comment mentioning {string} should be resolved', async ({ page, world }, text: string) => {
  // Resolved threads stay in the list, so the open count is what moves.
  await expect
    .poll(() => openThreadCount(page))
    .toBe(Number(world.openBefore) - 1);
  await showResolved(page);
  await expect(threadContaining(page, text).getByRole('button', { name: 'Reopen' })).toBeVisible();
});

When('I reopen the comment mentioning {string}', async ({ page }, text: string) => {
  await reopenThread(page, text);
});

Then('the comment mentioning {string} should be open again', async ({ page, world }, text: string) => {
  await expect.poll(() => openThreadCount(page)).toBe(Number(world.openBefore));
  await expect(threadContaining(page, text).getByRole('button', { name: 'Dismiss' })).toBeVisible();
});

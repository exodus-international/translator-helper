import { expect } from '@playwright/test';
import { When, Then } from './fixtures';
import { changeStatus, openStatusMenu } from '../support/status';
import { applyThread, dismissThread, showResolved, openThreadCount, reopenThread, threadContaining, threads, waitForFeedback } from '../support/threads';
import { selectTranslationLine } from '../support/editor';
import { dragSuggestionWindow, suggestionWindow, suggestionWindowBox } from '../support/floating-window';

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

When('my window is too short to show all the feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
});

When('I show the resolved feedback', async ({ page }) => {
  await showResolved(page);
});

Then('I should be able to scroll to the last piece of feedback', async ({ page }) => {
  // The last control of the last thread, because a thread can be taller than
  // the panel. toBeInViewport rather than toBeVisible: a thread clipped by its
  // card still counts as visible, and that clipping is what this guards.
  const lastControl = threads(page).last().getByRole('button').last();
  await lastControl.scrollIntoViewIfNeeded();
  await expect(lastControl).toBeInViewport({ ratio: 1 });
});

When('I apply the suggestion proposing {string}', async ({ page }, proposed: string) => {
  await applyThread(page, proposed);
});

When('I select a line and suggest an edit', async ({ page }) => {
  await selectTranslationLine(page, 3);
  await page.getByRole('button', { name: 'Suggest edit' }).click();
});

Then('the suggestion window should be open', async ({ page }) => {
  await expect(suggestionWindow(page)).toBeVisible();
});

Then('the comment field should have the caret', async ({ page }) => {
  await expect(suggestionWindow(page).getByLabel('Comment')).toBeFocused();
});

When('I move the suggestion window out of the way', async ({ page, world }) => {
  world.suggestionBefore = JSON.stringify(await suggestionWindowBox(page));
  await dragSuggestionWindow(page, -200, 200);
});

Then('it should have moved with the pointer', async ({ page, world }) => {
  const before = JSON.parse(world.suggestionBefore) as { x: number; y: number };
  const after = await suggestionWindowBox(page);
  // The drag was -200/+200; a clamp may absorb some of it, but not all.
  expect(before.x - after.x).toBeGreaterThanOrEqual(100);
  expect(after.y - before.y).toBeGreaterThanOrEqual(100);
  await expect(suggestionWindow(page)).toBeVisible();
});

When('I write {string} in the suggestion window', async ({ page }, text: string) => {
  await suggestionWindow(page).getByLabel('Comment').fill(text);
});

Then('the suggestion window should hold {string}', async ({ page }, text: string) => {
  await expect(suggestionWindow(page).getByLabel('Comment')).toHaveValue(text);
  await expect(suggestionWindow(page)).toBeVisible();
});

When('I drag the suggestion window far off the screen', async ({ page }) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('The page has no viewport size.');
  await dragSuggestionWindow(page, viewport.width, viewport.height);
});

Then('it should stay on screen', async ({ page }) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('The page has no viewport size.');
  const box = await suggestionWindowBox(page);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
});

When('I save the suggestion', async ({ page }) => {
  await suggestionWindow(page).getByRole('button', { name: 'Save' }).click();
});

Then('the feedback should mention {string}', async ({ page }, text: string) => {
  await waitForFeedback(page);
  await expect(threadContaining(page, text)).toBeVisible();
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

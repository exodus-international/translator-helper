import { expect, type Page } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import { changeStatus, currentStatus } from '../support/status';
import { GITHUB_STUB, gitHubMockState, refuseNextGitHubPush, resetGitHubMock } from '../support/github-stub';

/** A deploy runs in the background after it is confirmed; its toast reports the outcome. */
const DEPLOY_TIMEOUT = 30_000;

const confirmDialog = (page: Page) => page.getByRole('alertdialog');
const toasts = (page: Page) => page.locator('[data-sonner-toast]');

/** The document's Deploy section sits in the sidebar's Details card, which starts closed unless it is deployed. */
async function openDetails(page: Page) {
  const details = page.getByRole('button', { name: 'Details', exact: true });
  if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
  await expect(details).toHaveAttribute('aria-expanded', 'true');
}

/** The Deploy section's label row is a plain span, not a heading. */
function deploySection(page: Page) {
  return page.locator('section').filter({ has: page.locator('span', { hasText: /^Deploy$/ }) });
}

Given('the content repository is empty', async () => {
  await resetGitHubMock();
});

Given('GitHub will refuse the next push', async () => {
  await refuseNextGitHubPush();
});

Given('it has been deployed once', async ({ page }) => {
  // The seed leaves it approved; an earlier scenario may already have deployed it.
  if ((await currentStatus(page)) === 'Approved') {
    await changeStatus(page, 'Deploy');
  } else {
    await openDetails(page);
    await deploySection(page).getByRole('button', { name: 'Redeploy' }).click();
  }
  await confirmDialog(page).getByRole('button', { name: /^(Deploy|Redeploy)$/ }).click();
  await expect(toasts(page).filter({ hasText: 'to GitHub' })).toBeVisible({ timeout: DEPLOY_TIMEOUT });
  await expect.poll(async () => (await gitHubMockState()).commits).toBe(1);
});

When('I choose Deploy from the status menu', async ({ page }) => {
  await changeStatus(page, 'Deploy');
});

Then('I should be asked to deploy {string} to the content repository', async ({ page }, title: string) => {
  const dialog = confirmDialog(page);
  await expect(dialog.getByRole('heading', { name: `Deploy "${title}"?` })).toBeVisible();
  await expect(dialog).toContainText(`Publishes to ${GITHUB_STUB.repository} on ${GITHUB_STUB.branch} in one commit.`);
});

When('I confirm the deploy', async ({ page }) => {
  await confirmDialog(page).getByRole('button', { name: 'Deploy', exact: true }).click();
  await expect(confirmDialog(page)).toBeHidden();
});

When('I redeploy it from its Deploy section', async ({ page }) => {
  await openDetails(page);
  await deploySection(page).getByRole('button', { name: 'Redeploy' }).click();
  await expect(confirmDialog(page).getByRole('heading', { name: /^Redeploy ".+"\?$/ })).toBeVisible();
  await confirmDialog(page).getByRole('button', { name: 'Redeploy', exact: true }).click();
});

async function expectToast(page: Page, message: string) {
  await expect(toasts(page).getByText(message, { exact: true })).toBeVisible({ timeout: DEPLOY_TIMEOUT });
}

Then('I should be told that {string} was deployed', async ({ page }, title: string) => {
  await expectToast(page, `Deployed "${title}" to GitHub`);
});

Then('I should be told that {string} was already up to date', async ({ page }, title: string) => {
  await expectToast(page, `"${title}" is already up to date on GitHub`);
});

Then('I should be told that {string} could not be deployed', async ({ page }, title: string) => {
  await expectToast(page, `Could not deploy "${title}"`);
});

When('I retry the deploy from the message', async ({ page }) => {
  await toasts(page).getByRole('button', { name: 'Retry' }).click();
});

Then(/^the deploy branch should have (\d+) commits?$/, async ({}, count: string) => {
  await expect.poll(async () => (await gitHubMockState()).commits).toBe(Number(count));
});

Then('the deploy history should show a deploy that succeeded with its commit', async ({ page }) => {
  await openDetails(page);
  const latest = deploySection(page).getByRole('list', { name: 'Deploy history' }).getByRole('listitem').first();
  await expect(latest).toContainText('Deployed');
  await expect(latest).toContainText('Published');
  const { head } = await gitHubMockState();
  await expect(latest.getByRole('link', { name: new RegExp(head.slice(0, 7)) })).toBeVisible();
  await expect(latest).toContainText(`on ${GITHUB_STUB.branch}`);
});

Then('the deploy history should show the failed deploy and its retry', async ({ page }) => {
  await openDetails(page);
  const rows = deploySection(page).getByRole('list', { name: 'Deploy history' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Deployed');
  await expect(rows.nth(0)).toContainText('Retry');
  await expect(rows.nth(1)).toContainText('Failed');
  await expect(rows.nth(1)).toContainText(GITHUB_STUB.refusedMessage);
  // Retried already, so the failure no longer offers its own Retry.
  await expect(rows.nth(1).getByRole('button', { name: /^Retry/ })).toHaveCount(0);
});

Then('deploying should be offered', async ({ page }) => {
  await expect(page.getByRole('menuitem', { name: /^Deploy\b/ })).toBeVisible();
  await page.keyboard.press('Escape');
});

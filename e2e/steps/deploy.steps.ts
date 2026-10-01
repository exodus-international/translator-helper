import { expect } from '@playwright/test';
import { When, Then } from './fixtures';
import { changeStatus } from '../support/status';

When('I deploy the translation', async ({ page }) => {
  await changeStatus(page, 'Deploy');
  // Without generated audio the app asks whether to go ahead anyway. The
  // test environment has no speech provider, so the question is usually
  // skipped as not applicable; when it does appear, the answer is yes.
  const askedAboutAudio = await page
    .getByRole('alertdialog', { name: 'Deploy without audio?' })
    .waitFor({ state: 'visible', timeout: 1_500 })
    .then(() => true, () => false);
  if (askedAboutAudio) {
    await page.getByRole('button', { name: 'Deploy anyway' }).click();
  }
});

Then('I should see that the pull request was created', async ({ page }) => {
  // Reported as a toast once the server action returns with the PR.
  await expect(page.getByText('GitHub PR created successfully')).toBeVisible({ timeout: 30_000 });
});

Then('the document should link to pull request {int}', async ({ page }, number: number) => {
  await expect(page.getByRole('link', { name: `PR #${number}` }).first()).toBeVisible();
});

Then('deploying should not be offered', async ({ page }) => {
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Deploy', exact: true })).toHaveCount(0);
});

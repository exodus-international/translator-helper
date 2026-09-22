import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import { signIn } from '../support/sign-in';

Given('I am signed out', async ({ page }) => {
  // Untagged scenarios already start with no session; this makes the
  // precondition visible in the feature file rather than implied by a missing
  // tag.
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
});

When('I sign in as {string}', async ({ page }, email: string) => {
  await signIn(page, email);
});

When('I sign in as {string} with the password {string}', async ({ page }, email, password) => {
  await signIn(page, email, password);
});

When('I visit {string}', async ({ page }, target: string) => {
  await page.goto(target);
});

When('I continue to the dashboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Continue to Dashboard' }).click();
});

Then('I should be on the dashboard', async ({ page }) => {
  await page.waitForURL('**/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
});

Then('I should be asked to complete my profile', async ({ page }) => {
  await page.waitForURL('**/onboarding/profile');
  await expect(page.getByRole('button', { name: 'Continue to Dashboard' })).toBeVisible();
});

Then('I should be told the sign in failed', async ({ page }) => {
  // Reported as a toast rather than inline text. Asserting the wording the
  // user actually reads, not merely that some notification appeared.
  await expect(page.getByText('Invalid email or password')).toBeVisible();
});

Then('I should still be on the login page', async ({ page }) => {
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

Then('I should be sent to the login page', async ({ page }) => {
  // The guard keeps where the visitor was heading in a `from` parameter, so
  // the URL is not a bare /login.
  await page.waitForURL(/\/login(\?|$)/);
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
});

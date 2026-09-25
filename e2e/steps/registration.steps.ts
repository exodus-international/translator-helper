import { expect } from '@playwright/test';
import { When, Then } from './fixtures';
import { INVITE_TOKEN, SEED_PASSWORD } from '../support/identities';

When('I open the seeded invitation', async ({ page }) => {
  await page.goto(`/register/${INVITE_TOKEN}`);
});

When(
  'I register as {string} with the name {string}',
  async ({ page }, email: string, name: string) => {
    await page.getByLabel('Full Name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
  },
);

When('I open the invitation link signed out', async ({ page, world, context }) => {
  // The link was captured while signed in as an administrator; the person
  // following it is not signed in at all.
  await context.clearCookies();
  await page.goto(world.inviteUrl);
});

When('I open the invitation {string}', async ({ page }, token: string) => {
  await page.goto(`/register/${token}`);
});

Then('I should not be able to register', async ({ page }) => {
  // The four refusals read differently to a person but agree on one thing:
  // there is no form to fill in.
  await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Go to Login' })).toBeVisible();
});

import { When } from './fixtures';
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

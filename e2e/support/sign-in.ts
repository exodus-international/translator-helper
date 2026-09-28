import { expect, type Page } from '@playwright/test';
import { SEED_PASSWORD } from './identities';

/**
 * Signs in through the real form.
 *
 * Every field is reached by its label rather than by an id or a test id: the
 * login form associates its labels properly, so the accessible name is already
 * the most durable handle available.
 */
export async function signIn(page: Page, email: string, password: string = SEED_PASSWORD) {
  await submitLogin(page, email, password);

  // better-auth allows three sign-in attempts per ten seconds and enables that
  // limit in production only, so a suite that signs several people in quickly
  // is invisible against a dev server and refused against a real build. Only a
  // refusal waits, and only for the rate limit: a wrong password still fails
  // immediately, which is what its own scenario asserts.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const refused = page.getByText(/too many requests|rate limit/i);
    if ((await refused.count()) === 0) return;
    await page.waitForTimeout(11_000);
    await submitLogin(page, email, password);
  }
}

async function submitLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  // Give the response time to land before looking for a refusal.
  await page.waitForTimeout(500);
}

/**
 * Clears the onboarding gate if it is showing.
 *
 * The seed leaves every user un-onboarded, so a first sign-in lands on the
 * profile form rather than the dashboard. Only the full name is required and
 * the seed already supplies it, so this is a single click. Completing it here
 * means the stored sessions belong to onboarded people and every other
 * scenario starts where its user would actually be.
 */
export async function completeOnboardingIfShown(page: Page) {
  if (!page.url().includes('/onboarding/profile')) return;

  await expect(page.getByLabel(/Full name/i)).not.toBeEmpty();
  await page.getByRole('button', { name: 'Continue to Dashboard' }).click();
}

/** Signs in and lands the user on their dashboard, whatever stands in the way. */
export async function signInAndSettle(page: Page, email: string, password?: string) {
  await signIn(page, email, password);
  await page.waitForURL(/\/(dashboard|onboarding\/profile)/);
  await completeOnboardingIfShown(page);
  await page.waitForURL('**/dashboard');
}

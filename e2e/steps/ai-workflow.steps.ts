import { expect } from '@playwright/test';
import type { DocumentStatus } from '@/generated/prisma/enums';
import { Given, When, Then } from './fixtures';
import { languageCode } from '../support/documents';
import { signInAndSettle } from '../support/sign-in';
import { replaceAllInTranslation } from '../support/editor';
import { currentStatus, statusName } from '../support/status';

async function openSettings(page: import('@playwright/test').Page, language: string) {
  await page.goto(`/languages/${languageCode(language)}/settings`);
  await expect(page.getByLabel('How new documents are translated')).toBeVisible();
}

/** The settings page saves itself; this waits for it to say so. */
async function waitForSave(page: import('@playwright/test').Page) {
  await expect(page.getByText(/^Saved/).first()).toBeVisible({ timeout: 15_000 });
}

async function chooseWorkflow(page: import('@playwright/test').Page, option: RegExp) {
  await page.getByLabel('How new documents are translated').click();
  await page.getByRole('option', { name: option }).click();
}

Given(
  '{word} uses the AI workflow, deploying to {string}',
  async ({ page }, language: string, branch: string) => {
    await openSettings(page, language);
    const branchField = page.getByLabel('GitHub branch *');
    if ((await branchField.inputValue()) !== branch) {
      await branchField.fill(branch);
    }
    await chooseWorkflow(page, /^AI:/);
    await waitForSave(page);
  },
);

Then('{word} can go back to the manual workflow', async ({ page }, language: string) => {
  await openSettings(page, language);
  await chooseWorkflow(page, /^Manual:/);
  await waitForSave(page);
  await page.reload();
  await expect(page.getByLabel('How new documents are translated')).toHaveText(/Manual/);
});

/**
 * Two approvals take two people, so the scenario changes hands part way. The
 * stored session goes first; the login page sends a signed-in visitor away.
 */
When('{string} takes over', async ({ page, context }, email: string) => {
  await context.clearCookies();
  await signInAndSettle(page, email);
});

When('I hand the document to the AI workflow', async ({ page }) => {
  // The button is drawn by the server before React hydrates it, and a click
  // that lands before then does nothing. Retrying until the toast says it
  // worked is the difference between a reliable step and a silent no-op.
  await expect(async () => {
    await page.getByRole('button', { name: 'Hand to the AI workflow' }).click({ timeout: 2_000 });
    await expect(page.getByText('Handed to the AI')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});

/**
 * The AI and the deploy run after the response, so the status moves on the
 * server while the page shows the old one. The page reloads itself every few
 * seconds while a step runs; reloading here as well keeps the wait short.
 */
Then('its status should become {string}', async ({ page }, status: string) => {
  const expected = statusName(status as DocumentStatus);
  await expect
    .poll(
      async () => {
        const shown = await currentStatus(page);
        if (shown !== expected) await page.reload();
        return currentStatus(page);
      },
      { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe(expected);
});

/**
 * Someone watching the page while the AI translates sees the draft arrive:
 * the panel refreshes the page every ten seconds, and the editor remounts
 * when the status moves. No reload here, so a stale editor fails the step.
 */
Then("the AI's draft should show up without a reload", async ({ page }) => {
  await expect.poll(() => currentStatus(page), { timeout: 45_000, intervals: [1_000] }).toBe(
    statusName('PENDING_REVIEW' as DocumentStatus),
  );
  await expect(aiPanel(page)).toContainText('of 2 approvals');
});

function aiPanel(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: 'AI workflow' });
}

/**
 * The panel lists every step with who does it. A reviewer reads from it that
 * the draft in front of them is the AI's and that the next move is the team's.
 */
Then(
  "the AI workflow should show the AI's draft as done and the team's text review as the current step",
  async ({ page }) => {
    const steps = aiPanel(page).getByRole('list', { name: 'Steps' }).locator('> li');
    const draft = steps.filter({ hasText: 'Draft the translation' });
    await expect(draft).toContainText('AI');
    await expect(draft).toContainText('(done)');
    const review = steps.filter({ hasText: 'Review the text' });
    await expect(review).toContainText('Team');
    await expect(review).toHaveAttribute('aria-current', 'step');
  },
);

Then('approving the text should wait for the open comments', async ({ page }) => {
  await expect(aiPanel(page).getByRole('button', { name: 'Approve text' })).toBeDisabled();
  await expect(aiPanel(page).getByText(/1 open comment, including the AI's/)).toBeVisible();
  await expect(aiPanel(page).getByRole('button', { name: 'Show the comments' })).toBeVisible();
});

When('I approve the text', async ({ page }) => {
  const approve = aiPanel(page).getByRole('button', { name: 'Approve text' });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByText(/^Approved/).first()).toBeVisible();
});

Then('the text should have {int} of {int} approvals', async ({ page }, given: number, required: number) => {
  await expect(aiPanel(page).getByText(`${given} of ${required} approvals`, { exact: false })).toBeVisible();
  await expect(aiPanel(page).getByRole('button', { name: 'Withdraw my approval' })).toBeVisible();
});

/**
 * The status moves to DEPLOYED before the pull request is recorded, so a page
 * that loaded in between shows no link yet. Reload until it does.
 */
Then('the document should come to link to pull request {int}', async ({ page }, number: number) => {
  const link = page.getByRole('link', { name: `PR #${number}` }).first();
  await expect(async () => {
    if (!(await link.isVisible())) await page.reload();
    await expect(link).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
});

Then('no AI step should have failed', async ({ page }) => {
  await expect(aiPanel(page)).toBeVisible();
  await expect(aiPanel(page).getByRole('alert')).toHaveCount(0);
});

When(
  'I edit the text directly, replacing every {string} with {string}',
  async ({ page }, find: string, replacement: string) => {
    await page.getByRole('button', { name: 'Edit text' }).click();
    await replaceAllInTranslation(page, find, replacement);
    // Autosave writes the edit; going back to review writes anything left.
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to review' }).click();
    await expect(page.getByRole('button', { name: 'Edit text' })).toBeVisible();
  },
);

Then('the activity log should show my edit, with {string} in its changes', async ({ page }, text: string) => {
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('button', { name: 'View changes' }).first().click();
  const dialog = page.getByRole('dialog', { name: /Changes by/ });
  await expect(dialog).toContainText(text);
});

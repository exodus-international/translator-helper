import { expect } from '@playwright/test';
import { When, Then } from './fixtures';

When(
  'I add a source project named {string} with the slug {string}',
  async ({ page }, name: string, slug: string) => {
    await page.getByRole('button', { name: 'Add Source Project' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Project Name/).fill(name);
    // The slug fills itself from the name; setting it keeps the scenario in
    // charge of the URL it asserts on later.
    await dialog.getByLabel(/URL Slug/).fill(slug);
    // Deploying is on by default and then demands a repository directory,
    // which is a GitHub concern this scenario has nothing to say about.
    await dialog.getByLabel('Deploy to GitHub').uncheck();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
  },
);

Then('{string} should be listed', async ({ page }, name: string) => {
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});

Then('the project page for {string} should open', async ({ page }, slug: string) => {
  await page.goto(`/projects/${slug}`);
  await expect(page).toHaveURL(new RegExp(`/projects/${slug}$`));
});

async function chooseProject(page: import('@playwright/test').Page, project: string) {
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: project }).click();
}

When(
  'I write a new document titled {string} in the project {string}',
  async ({ page }, title: string, project: string) => {
    await page.getByRole('tab', { name: 'Create New' }).click();
    await page.getByLabel(/^Title/).fill(title);
    await chooseProject(page, project);
    await page.getByLabel(/^Content/).fill(`# ${title}\n\nEnglish source written by the suite.`);
    await page.getByRole('button', { name: 'Create Document' }).click();
    // Creating navigates away. Waiting for that is what stops the search below
    // running against a document that is still being written.
    await expect(page).not.toHaveURL(/\/documents\/new$/);
  },
);

When(
  'I upload the sample document into the project {string}',
  async ({ page, world }, project: string) => {
    await page.getByRole('tab', { name: 'Upload File' }).click();
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/sample-document.md');

    // Uploading fills the same form the other tab uses, so finishing happens
    // there. The title comes from the file's frontmatter and the form may then
    // compose it with the project's acronym, so it is read back rather than
    // assumed.
    await page.getByRole('tab', { name: 'Create New' }).click();
    const titleField = page.getByLabel(/^Title/);
    await expect(titleField).not.toBeEmpty();
    world.uploadedTitle = await titleField.inputValue();

    await chooseProject(page, project);
    await page.getByRole('button', { name: 'Create Document' }).click();
    // Creating navigates away. Staying put means the form refused, and the
    // toast says why, which is a far better failure than an empty list later.
    await expect(page).not.toHaveURL(/\/documents\/new$/);
  },
);

Then('the uploaded document should exist', async ({ page, world }) => {
  const title = world.uploadedTitle;
  await page.goto(`/documents?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole('row', { name: new RegExp(title) }).first()).toBeVisible();
});

Then('the document {string} should exist', async ({ page }, title: string) => {
  // The documents overview is the list a person would check.
  await page.goto(`/documents?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole('row', { name: new RegExp(title) }).first()).toBeVisible();
});

When('I create an invitation', async ({ page }) => {
  await page.getByRole('tab', { name: 'Invitations' }).click();
  await page.getByRole('button', { name: 'Create Invitation' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create' }).click();
});

Then('I should be given an invitation link', async ({ page, world }) => {
  const dialog = page.getByRole('dialog');
  // The dialog swaps to a read-only field holding the link once it is made.
  await expect(dialog.getByRole('heading', { name: 'Invitation Created' })).toBeVisible();
  world.inviteUrl = await dialog.getByRole('textbox').first().inputValue();
  expect(world.inviteUrl).toContain('/register/');
});

Then('the page should not be an error', async ({ page }) => {
  // An empty fixture is exactly what tends to throw, so the first thing worth
  // asserting is that the page rendered at all.
  await expect(page.getByText(/Application error|something went wrong/i)).toHaveCount(0);
  await expect(page.getByRole('heading').first()).toBeVisible();
});

Then('I should see an empty state', async ({ page }) => {
  await expect(
    page.getByText(/no documents|no translations|nothing here|no members|no team|empty/i).first(),
  ).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { click, hover, pause, stage } from './support/stage';

test('languages: health at a glance, the overview, and the team', async ({ browser }) => {
  // Each seeded language is misconfigured in its own way (see seedLanguageScenarios).
  const scene = await stage(browser, 'languages', 'admin@example.org');
  const { page } = scene;

  await page.goto('/languages');
  await expect(page.getByRole('heading', { name: 'Languages' })).toBeVisible();
  await pause(page, 1200);
  scene.action();
  await pause(page, 800);

  // Croatian fails every check; the pills say what breaks, and where.
  await hover(page, page.getByText('No GitHub branch — deploy will fail').first(), 800);
  await pause(page, 1300);
  await hover(page, page.getByText('No voice — approvals generate no audio').first(), 500);
  await pause(page, 1000);

  // Czech is the healthy one: its overview rolls progress up across projects.
  await click(page, page.getByRole('link', { name: /Czech/ }).first(), 800);
  await page.waitForURL('**/languages/cs');
  await expect(page.getByText(/Deployed across/i)).toBeVisible();
  await pause(page, 1200);
  await hover(page, page.getByText('In Review', { exact: true }).first(), 700);
  await pause(page, 900);
  await hover(page, page.getByText('Exodus90 2026').first(), 600);
  await pause(page, 1200);

  // Who is on the team, and what each person still has open.
  await click(page, page.getByRole('link', { name: /^Team/ }).first(), 800);
  await page.waitForURL('**/languages/cs/team');
  await expect(page.getByText('Open work', { exact: false }).first()).toBeVisible();
  await pause(page, 900);
  await hover(page, page.getByText('6 open'), 700);
  await pause(page, 1000);
  await click(page, page.getByRole('combobox').nth(1), 600);
  await pause(page, 1800);
  await page.keyboard.press('Escape');
  await pause(page, 900);

  await scene.cut();
});

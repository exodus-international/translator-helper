import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { OUTPUT_DIR, hideCursor, pause, stage } from './support/stage';

/** Stills for the smaller changes, where a moving picture adds nothing. */
test('stills: collapsed sidebar, and a project that does not deploy', async ({ browser }) => {
  const scene = await stage(browser, 'stills', 'admin@example.org');
  const { page } = scene;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  // The sidebar folded to icons.
  await page.goto('/dashboard');
  await expect(page.getByText('My Projects')).toBeVisible();
  await page.getByRole('button', { name: /Toggle Sidebar/i }).first().click();
  await pause(page, 900);
  await hideCursor(page);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'sidebar-collapsed.png') });
  await page.getByRole('button', { name: /Toggle Sidebar/i }).first().click();
  await pause(page, 600);

  // A project with Deploy to GitHub switched off, and the warning that says what that means.
  await page.getByRole('button', { name: /New Project/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Project Name/).fill('Parish Retreat 2026');
  await dialog.getByLabel(/Description/).fill('Talks and small-group guides for the spring parish retreat.');
  await dialog.getByLabel('Deploy to GitHub').click();
  await pause(page, 700);
  await hideCursor(page);
  await dialog.screenshot({ path: path.join(OUTPUT_DIR, 'project-without-deploy.png') });

  await scene.context.close();
});

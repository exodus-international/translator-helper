import { expect, test } from '@playwright/test';
import { click, hover, pause, stage } from './support/stage';

test('notifications: the bell, the inbox, and straight to the thread', async ({ browser }) => {
  // The demo layer gives the translator a week of notifications, some unread.
  const scene = await stage(browser, 'notifications', 'translator@example.org');
  const { page } = scene;

  await page.goto('/dashboard');
  const bell = page.getByRole('button', { name: /^Notifications/ });
  await expect(bell).toBeVisible();
  await expect(page.getByText('My Work')).toBeVisible();
  await pause(page, 1200);
  scene.action();
  await pause(page, 600);

  // The unread count, then the list.
  await click(page, bell, 900);
  await expect(page.getByText('View all notifications')).toBeVisible();
  await pause(page, 1200);
  await hover(page, page.getByText(/is overdue/).first(), 600);
  await pause(page, 1000);

  // The full inbox.
  await click(page, page.getByText('View all notifications'), 700);
  await page.waitForURL('**/notifications');
  await pause(page, 1600);

  // A reply opens the document with its thread in view.
  await click(page, page.getByText(/^New reply on/).first(), 800);
  await page.waitForURL(/thread=/);
  await expect(page.getByText('Let me check the glossary', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await pause(page, 3000);

  await scene.cut();
});

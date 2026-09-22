import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Drives the feedback panel.
 *
 * Threads are articles inside a named region, so they are counted and targeted
 * through roles rather than through the panel's markup. Nothing outside this
 * module knows how a thread is built.
 */
export function feedbackPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Feedback' });
}

export function threads(page: Page): Locator {
  return feedbackPanel(page).getByRole('article');
}

/** The thread that mentions some text, which is how a scenario names one. */
export function threadContaining(page: Page, text: string): Locator {
  return threads(page).filter({ hasText: text });
}

/**
 * Waits for the panel to finish loading.
 *
 * The heading renders as a bare "Feedback" first and only gains its "(2 open)"
 * count once the threads arrive, so reading the count too early reports zero
 * for a document that has plenty. Settling means either at least one thread is
 * on screen or the panel has said there are none.
 */
export async function waitForFeedback(page: Page) {
  const panel = feedbackPanel(page);
  await expect(panel).toBeVisible();
  await expect(
    threads(page).first().or(panel.getByText('No feedback yet')),
  ).toBeVisible();
}

/**
 * How many threads are still open, read from the panel's own heading rather
 * than counted from the cards: the heading is what a reviewer actually reads,
 * and resolved threads stay in the list.
 */
export async function openThreadCount(page: Page): Promise<number> {
  const heading = feedbackPanel(page).getByRole('heading', { name: /^Feedback/i });
  // The heading is styled uppercase, and innerText returns text as rendered,
  // so this reads "FEEDBACK (2 OPEN)". Matching case-insensitively rather than
  // relying on how it happens to be styled today.
  const text = (await heading.innerText()).trim();
  const match = text.match(/\((\d+)\s*open\)/i);
  return match ? Number(match[1]) : 0;
}

export async function applyThread(page: Page, text: string) {
  await threadContaining(page, text).getByRole('button', { name: 'Apply' }).click();
}

export async function dismissThread(page: Page, text: string) {
  await threadContaining(page, text).getByRole('button', { name: 'Dismiss' }).click();
}

export async function reopenThread(page: Page, text: string) {
  await threadContaining(page, text).getByRole('button', { name: 'Reopen' }).click();
}

/**
 * Reveals resolved threads.
 *
 * They stay in the list but collapse behind a counter once the first one is
 * resolved, so anything looking for a dismissed thread has to open that first.
 */
export async function showResolved(page: Page) {
  const toggle = feedbackPanel(page).getByRole('button', { name: /^Resolved \(/ });
  if ((await toggle.count()) === 0) return;
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

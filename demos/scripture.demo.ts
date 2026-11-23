import { expect, test } from '@playwright/test';
import { translationPane } from '../e2e/support/editor';
import { click, glideTo, hover, pause, phraseBounds, stage } from './support/stage';

test('scripture: a citation checked against the Bible, and every notation fixed at once', async ({ browser }) => {
  // The demo layer leaves this draft citing Scripture the English way.
  const scene = await stage(browser, 'scripture', 'translator@example.org');
  const { page } = scene;

  await page.goto('/documents/exodus90/ex90-day-14/cs');
  const pane = translationPane(page);
  await expect(pane).toBeVisible();
  const card = page.getByRole('button', { name: /^Scripture/ });
  await expect(card).toContainText('to check');
  await pause(page, 1200);
  scene.action();
  await pause(page, 500);

  // Hovering a citation shows the passage in the language's own Bible.
  const citation = await phraseBounds(pane, 'Mark 1:12');
  await glideTo(page, (citation.start.x + citation.end.x) / 2, citation.start.y, 800);
  await expect(page.getByRole('button', { name: /^Use / })).toBeVisible();
  await pause(page, 2600);

  // The Scripture card lists every citation with its verdict.
  await click(page, card);
  const fixAll = page.getByRole('button', { name: /^Fix all notations/ });
  await expect(fixAll).toBeVisible();
  await pause(page, 1800);

  // English notation becomes the Czech Bible's, in one step.
  await click(page, fixAll);
  await pause(page, 2000);

  // The verse was translated by hand; the Bible's wording is one click away.
  const official = page.getByRole('button', { name: 'Use official text' }).first();
  await expect(official).toBeVisible();
  await click(page, official);
  await pause(page, 1200);
  await hover(page, pane.getByText('Písmo k rozjímání'), 900);
  await pause(page, 2400);

  await scene.cut();
});

import type { Page } from '@playwright/test';
import { buildDocumentPath } from '@/domain/document/document-url';

/**
 * The seeded documents, addressed the way a person would: by title and
 * language.
 *
 * Scenarios share one database and run in order, so a scenario that moves a
 * document's status would change what the next one finds. Each scenario
 * therefore works on its own document, which also means they can be read, run
 * and debugged one at a time.
 *
 * Mirrors `prisma/seed-data/`. Each pairing is chosen so the identity using it
 * holds rights over that language: the translator has sk and cs, the reviewer
 * has sk and hr.
 */
const SEEDED = [
  { title: 'Day 14 - The Desert', projectSlug: 'exodus90', slug: 'ex90-day-14', languageCode: 'sk' },
  { title: 'Friday of the First Week', projectSlug: 'lent2026', slug: 'lent-day-5', languageCode: 'sk' },
  { title: 'Palm Sunday Meditation', projectSlug: 'lent2026', slug: 'lent-palm-sunday', languageCode: 'cs' },
  { title: 'Day 45 - Midpoint Reflection', projectSlug: 'exodus90', slug: 'ex90-day-45', languageCode: 'cs' },
  { title: 'Day 2 - Discipline of Prayer', projectSlug: 'exodus90', slug: 'ex90-day-2', languageCode: 'sk' },
  { title: 'Day 1 - The Call', projectSlug: 'exodus90', slug: 'ex90-day-1', languageCode: 'hr' },
  { title: 'Day 3 - Fasting and Freedom', projectSlug: 'exodus90', slug: 'ex90-day-3', languageCode: 'cs' },
  // Approved in the seed, so deploy is the next step. Czech is deployed by
  // the admin; Slovak only shows a translator what is not offered.
  { title: 'Day 2 - Discipline of Prayer', projectSlug: 'exodus90', slug: 'ex90-day-2', languageCode: 'cs' },
  { title: 'Day 1 - The Call', projectSlug: 'exodus90', slug: 'ex90-day-1', languageCode: 'sk' },
] as const;

const LANGUAGE_CODES: Record<string, string> = {
  Slovak: 'sk',
  Czech: 'cs',
  Croatian: 'hr',
  German: 'de',
  French: 'fr',
};

export function languageCode(languageName: string): string {
  const code = LANGUAGE_CODES[languageName];
  if (!code) throw new Error(`Unknown language "${languageName}" -- add it to LANGUAGE_CODES.`);
  return code;
}

/**
 * Built with the application's own URL builder rather than a string template,
 * so a change to the route shape moves the tests with it.
 *
 * The editor URL carries no verb: which editor renders is decided by the
 * version's status, so never assert on a `/translate` or `/review` suffix.
 */
export function documentPath(title: string, languageName: string): string {
  const code = languageCode(languageName);
  const match = SEEDED.find((d) => d.title === title && d.languageCode === code);
  if (!match) {
    throw new Error(`No seeded document "${title}" in ${languageName}. See e2e/support/documents.ts.`);
  }
  return buildDocumentPath({ ...match, documentId: '' });
}

export async function openDocument(page: Page, title: string, languageName: string) {
  await page.goto(documentPath(title, languageName));
}

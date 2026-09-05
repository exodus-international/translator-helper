import { DocumentType } from '@/generated/prisma/enums';

/**
 * Builds the default title for an uploaded document, kept out of the upload
 * form so it can be tested without React.
 *
 * Days are the only type that gets a composed title. They arrive as bare
 * numbers ("13.md", or frontmatter `day: 13`) and were being renamed by hand
 * to carry the season and the day number, which is what this reproduces.
 */

const DAY_FILENAME = /^(\d{1,3})\s*\.(?:md|ya?ml)$/i;

/**
 * A lone dash in a project's acronym means "leave this project's titles
 * alone". An empty field cannot carry that meaning: it is what every project
 * starts out with, and it already says "no acronym, but still number the days".
 */
export const NAMING_DISABLED = '-';

/**
 * The day number is padded to two digits because both document lists sort
 * titles as plain strings. Unpadded, "Day 14" sorts before "Day 2". Days past
 * 99 keep their own width rather than being truncated; no programme is that
 * long today, and widening every other title to fix it would be worse.
 */
function formatDayNumber(day: number): string {
  return String(day).padStart(2, '0');
}

/**
 * Frontmatter is authored by hand, so `day` turns up as a number in some files
 * and a quoted string in others. Anything that is not a positive whole number
 * is treated as absent rather than guessed at.
 */
export function parseDayNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : null;
}

/** Days are uploaded as "13.md". Used only when frontmatter carries no `day`. */
export function dayNumberFromFilename(filename: string): number | null {
  const match = filename.match(DAY_FILENAME);
  return match ? parseDayNumber(match[1]) : null;
}

export interface DefaultTitleInput {
  /** `frontmatter.title`, or the filename with its extension stripped. */
  baseTitle: string;
  type: DocumentType | null;
  /** Project acronym, e.g. "SML". Absent for projects that have not set one. */
  acronym?: string | null;
  /** Resolved from frontmatter `day` first, then the filename. */
  day?: number | null;
}

/**
 * Returns the title to pre-fill. Every part is optional and drops out
 * independently, so a DAY with no acronym still gets "DAY 03 - ...", and one
 * with no day number is left exactly as it was.
 */
export function buildDefaultTitle({ baseTitle, type, acronym, day }: DefaultTitleInput): string {
  const base = baseTitle.trim();
  const prefix = acronym?.trim();

  if (prefix === NAMING_DISABLED) return base;
  if (type !== DocumentType.DAY || !day) return base;

  const parts = [prefix, `DAY ${formatDayNumber(day)}`, base].filter((part) => Boolean(part && part.length > 0));
  return parts.join(' - ');
}

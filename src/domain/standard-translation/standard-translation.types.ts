import { z } from 'zod';
import { SourceProjectStatus } from '@/generated/prisma/enums';

const NAME_MAX_LENGTH = 200;
const TEXT_MAX_LENGTH = 20000;
const NOTE_MAX_LENGTH = 2000;

/** Blank is "none", stored as null. Absent means the same. */
const blankToNull = (value: string | null | undefined) => value || null;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `is longer than ${max.toLocaleString('en')} characters`)
    .nullish()
    .transform(blankToNull);

const requiredText = z
  .string()
  .trim()
  .min(1, 'is required')
  .max(TEXT_MAX_LENGTH, `is longer than ${TEXT_MAX_LENGTH.toLocaleString('en')} characters`);

/**
 * What a person writes on an entry. `sourceKey` is not among it: it is derived
 * from `sourceText` on the server, so matching can't be steered from a form.
 */
const entryFields = {
  /** Null makes the entry general: every project in the language. */
  sourceProjectId: z.uuid().nullable(),
  name: optionalText(NAME_MAX_LENGTH),
  sourceText: requiredText,
  targetText: requiredText,
  fixedForm: z.boolean().default(false),
  note: optionalText(NOTE_MAX_LENGTH),
};

export const createStandardTranslationSchema = z.object({
  languageId: z.uuid(),
  ...entryFields,
});

export type CreateStandardTranslationInput = z.output<typeof createStandardTranslationSchema>;

/**
 * An entry stays in the language it was written for: its permission is
 * checked against that language, so moving it would be a write into a
 * language nobody authorized. Strict, so a `languageId` is rejected rather
 * than quietly dropped.
 */
export const updateStandardTranslationSchema = z.strictObject(entryFields);

export type UpdateStandardTranslationInput = z.output<typeof updateStandardTranslationSchema>;

/**
 * Moving a project entry to all projects. `keep` answers the clash with a
 * general entry of the same source, and is only needed when there is one.
 */
export const moveStandardTranslationSchema = z.strictObject({
  keep: z.enum(['project', 'general']).optional(),
});

export type MoveKeep = z.output<typeof moveStandardTranslationSchema>['keep'];

/** Which entries the list shows: general ones, and those of the given projects. */
export interface ScopeSelection {
  includeGeneral: boolean;
  projectIds: string[];
}

const GENERAL_SCOPE = 'general';

/**
 * What the list shows when nothing is asked for: general entries and active
 * projects. Completed projects' entries are hidden until asked for. One rule
 * for the repository, which reads with it, and the page, which leaves it out
 * of the URL.
 */
export function defaultSelection(projects: { id: string; status: SourceProjectStatus }[]): ScopeSelection {
  return {
    includeGeneral: true,
    projectIds: projects.filter((project) => project.status === SourceProjectStatus.ACTIVE).map((project) => project.id),
  };
}

/**
 * `?scope=general,<projectId>,…`. Absent means the page's default selection
 * (null here, resolved against the language's projects by the repository);
 * present but empty means nothing is selected. Tokens that are neither
 * `general` nor a project id are dropped, so a stale bookmark never fails.
 * The page reads `q` and `page` with `parseListParams`, like every list page.
 */
export function parseScope(raw: string | string[] | undefined): ScopeSelection | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  const tokens = value.split(',').map((token) => token.trim());
  const projectIds = [...new Set(tokens.filter((token) => z.uuid().safeParse(token).success))];
  return { includeGeneral: tokens.includes(GENERAL_SCOPE), projectIds };
}

import { z } from 'zod';
import { DocumentType } from '@/generated/prisma/enums';
import { isUuid } from '@/lib/uuid';

/**
 * A project is addressed by two different names, and they are kept apart
 * because only one of them always exists:
 *
 *   slug                — the URL segment (/projects/{slug}, /documents/{slug}/...)
 *   repositoryDirectory — the folder its documents deploy into
 *
 * They used to be one field, which meant a project with no content repository
 * could not be created at all. Every project has a slug; only the ones that
 * deploy have a repository directory.
 *
 * A UUID-shaped value is rejected for either even though it passes the
 * character rule: the routes read a UUID in that position as an old id-based
 * link and look the project up by id, so such a project would never resolve by
 * its own slug.
 *
 * Dashes and underscores are both allowed as separators because existing
 * content folders use either ("exodus-90", "october_2026"). Runs of
 * separators and leading or trailing ones are still rejected.
 */
const notUuidShaped = (value: string) => !isUuid(value);
const notUuidMessage = 'Cannot look like an id';

const segment = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'Lowercase letters, numbers and single dashes or underscores only')
  .refine(notUuidShaped, notUuidMessage);

/**
 * Deliberately laxer than on create: values predating the format rule are
 * still valid URL segments and still name a folder in the content repo, so an
 * admin editing an unrelated field must not be blocked by one.
 */
const existingSegment = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[^\s/?#]+$/, 'No spaces, slashes, question marks or hashes')
  .refine(notUuidShaped, notUuidMessage);

/**
 * Short prefix for auto-named DAY titles ("SML" in "SML - DAY 03 - ..."), so
 * it is kept short and free of the separator the title is joined with.
 *
 * The one exception is a lone dash, which turns day naming off for the project
 * altogether. An empty field cannot mean that: it is the state every project
 * starts in, and it already means "no acronym, but still number the days".
 */
const sourceProjectAcronym = z
  .string()
  .max(16)
  .regex(/^(?:-|[^\s-]+)$/, 'No spaces or dashes, or a single dash to turn day naming off');

export const createSourceProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  slug: segment,
  // Optional: a project with no repository directory has no folder to deploy
  // into, so its documents skip the GitHub push instead of erroring.
  repositoryDirectory: segment.optional(),
  acronym: sourceProjectAcronym.optional().nullable(),
});

export const updateSourceProjectSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  slug: existingSegment.optional(),
  // Nullable so an admin can turn GitHub deploy off for a project.
  repositoryDirectory: existingSegment.optional().nullable(),
  status: z.enum(['ACTIVE', 'COMPLETE']).optional(),
  audioDocumentTypes: z.array(z.enum(DocumentType)).optional(),
  // Nullable so an admin can clear the acronym and go back to unprefixed titles.
  acronym: sourceProjectAcronym.optional().nullable(),
});

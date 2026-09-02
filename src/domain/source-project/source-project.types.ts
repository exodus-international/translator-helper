import { z } from 'zod';
import { DocumentType } from '@prisma/client';
import { isUuid } from '@/lib/uuid';

/**
 * The identifier is a URL segment (/projects/{identifier},
 * /documents/{identifier}/...) and the folder name in the content repository,
 * so it is required, unique, and restricted to what is safe in both.
 *
 * A UUID-shaped identifier is rejected even though it passes the character
 * rule: the routes read a UUID in that position as an old id-based link and
 * look the project up by id, so such a project would never resolve by its own
 * identifier.
 */
const notUuidShaped = (value: string) => !isUuid(value);
const notUuidMessage = 'Cannot look like an id';

export const sourceProjectIdentifier = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single dashes only')
  .refine(notUuidShaped, notUuidMessage);

/**
 * Short prefix for auto-named DAY titles ("SML" in "SML - DAY 03 - ..."), so
 * it is kept short and free of the separator the title is joined with.
 */
export const sourceProjectAcronym = z
  .string()
  .max(16)
  .regex(/^[^\s-]+$/, 'No spaces or dashes');

export const createSourceProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  identifier: sourceProjectIdentifier,
  acronym: sourceProjectAcronym.optional().nullable(),
});

export const updateSourceProjectSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  // Deliberately laxer than on create: identifiers predating the format rule
  // are still valid URL segments and still name a folder in the content repo,
  // so an admin editing an unrelated field must not be blocked by one.
  identifier: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[^\s/?#]+$/, 'No spaces, slashes, question marks or hashes')
    .refine(notUuidShaped, notUuidMessage)
    .optional(),
  status: z.enum(['ACTIVE', 'COMPLETE']).optional(),
  audioDocumentTypes: z.array(z.enum(DocumentType)).optional(),
  // Nullable so an admin can clear the acronym and go back to unprefixed titles.
  acronym: sourceProjectAcronym.optional().nullable(),
});


import { z } from 'zod';
import { DocumentType } from '@prisma/client';

/**
 * The identifier is a URL segment (/documents/{identifier}/...) and the folder
 * name in the content repository, so it is required, unique, and restricted to
 * what is safe in both.
 */
export const sourceProjectIdentifier = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single dashes only');

export const createSourceProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  identifier: sourceProjectIdentifier,
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
    .optional(),
  status: z.enum(['ACTIVE', 'COMPLETE']).optional(),
  audioDocumentTypes: z.array(z.enum(DocumentType)).optional(),
});


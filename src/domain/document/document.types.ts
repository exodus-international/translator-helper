import { DocumentType } from '@prisma/client';
import { z } from 'zod';
import { validateFilename } from './validate-filename';

/**
 * Mirrors the client-side filename rules on the server boundary so a direct
 * action call can't create records with a missing/invalid originalFilename for
 * types whose filename drives the deploy path (DAILY_CONTENT, MEETING, ROOT_FILE).
 */
function refineFilenameForType(
  data: { type?: DocumentType | null; originalFilename?: string | null },
  ctx: z.RefinementCtx,
) {
  if (!data.type) return;
  const error = validateFilename(data.type, data.originalFilename ?? '');
  if (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['originalFilename'] });
  }
}

export const createDocumentSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9\-]+$/),
    title: z.string().min(1),
    content: z.string(),
    sourceProjectId: z.string().uuid('Source project is required'),
    folderId: z.string().optional(), // Deprecated - kept for backward compatibility
    labels: z.array(z.string()).default([]),
    deadline: z.coerce.date().optional(),
    originalFilename: z.string().optional(),
    type: z.nativeEnum(DocumentType).optional(),
  })
  .superRefine(refineFilenameForType);

export const updateDocumentSchema = z
  .object({
    title: z.string().min(1).optional(),
    sourceProjectId: z.string().nullable().optional(),
    folderId: z.string().nullable().optional(), // Deprecated - kept for backward compatibility
    labels: z.array(z.string()).optional(),
    deadline: z.coerce.date().nullable().optional(),
    type: z.nativeEnum(DocumentType).nullable().optional(),
    originalFilename: z.string().nullable().optional(),
  })
  .superRefine(refineFilenameForType);


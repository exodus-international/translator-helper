import { z } from 'zod';

// z.coerce.date() would turn null into new Date(0), so expiry is
// normalized via preprocess: empty/absent values become null, anything
// else must parse to a valid date.
const expiresAtSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === '' ? null : new Date(value as string | number | Date)),
  z.date().nullable(),
);

const nullableTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().min(1).nullable().optional().default(null),
);

export const announcementInputSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    body: z.string().min(1, 'Body is required'),
    type: z.enum(['BANNER', 'MODAL']),
    ctaLabel: nullableTrimmedString,
    ctaUrl: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().url('CTA URL must be a valid URL').nullable().optional().default(null),
    ),
    isActive: z.boolean().optional().default(false),
    expiresAt: expiresAtSchema,
  })
  .refine((data) => (data.ctaLabel === null) === (data.ctaUrl === null), {
    message: 'CTA label and URL must be provided together',
    path: ['ctaLabel'],
  });

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

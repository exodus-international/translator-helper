import { z } from 'zod';
import { DocumentType } from '@prisma/client';

export interface FilePathParams {
  documentType: DocumentType;
  languageCode: string;
  identifier: string;
  originalFilename: string | null;
  slug: string;
}

export const pullRequestWebhookSchema = z.object({
  action: z.string(),
  number: z.number(),
  pull_request: z.object({
    number: z.number(),
    merged: z.boolean(),
    state: z.string(),
    title: z.string(),
    html_url: z.string(),
  }),
});


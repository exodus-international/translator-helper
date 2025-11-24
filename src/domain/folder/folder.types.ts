import { z } from 'zod';

export const createFolderSchema = z.object({
  name: z.string().min(2),
});

export const updateFolderSchema = z.object({
  name: z.string().min(2),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;

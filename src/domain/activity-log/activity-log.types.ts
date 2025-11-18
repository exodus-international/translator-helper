import { z } from "zod";

export const createActivityLogSchema = z.object({
  documentVersionId: z.string(),
  action: z.string(),
  details: z.record(z.any()).optional(),
});

export type CreateActivityLogInput = z.infer<typeof createActivityLogSchema>;

export type ActivityAction =
  | "created"
  | "created_translation"
  | "edited"
  | "submitted_for_review"
  | "approved"
  | "requested_changes"
  | "deployed"
  | "deleted";

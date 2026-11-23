import { z } from 'zod';
import type { DeploymentItemOutcome, DeploymentStatus, DeploymentTrigger } from '@/generated/prisma/enums';

/** What the client is told about a deployment: plain data, dates as ISO strings. */
export interface DeploymentView {
  id: string;
  status: DeploymentStatus;
  trigger: DeploymentTrigger;
  requestedBy: { id: string; name: string | null; image: string | null } | null;
  sourceProject: { name: string; slug: string } | null;
  language: { name: string; code: string } | null;
  branch: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  retryOfId: string | null;
  counts: Record<DeploymentItemOutcome, number>;
  items: DeploymentItemView[];
}

export interface DeploymentItemView {
  id: string;
  documentVersionId: string;
  title: string;
  languageName: string;
  languageCode: string;
  /** The document's editor in this language. */
  href: string;
  outcome: DeploymentItemOutcome;
  filePath: string | null;
  error: string | null;
}

/** What the confirmation shows before anything is sent. */
export interface DeployPreview {
  /** The documents that would go out, in the order the commit lists them. */
  documents: { id: string; title: string; languageName: string; status: string }[];
  /** owner/name and branch, or null when GitHub is not set up. */
  target: { repository: string; branch: string } | null;
  /** Documents with no recording yet, or one made from older text. */
  audioNotReady: number;
  /** Documents whose project has no repository directory: marked deployed, not published. */
  notPublished: number;
  /** Documents already in a deploy that is running; they join it. */
  alreadyRunning: number;
}

export type DeployStarted =
  | { deploymentId: string; joined: boolean }
  /** Nothing to deploy in that scope. */
  | { deploymentId: null; joined: false };

export const versionIdsSchema = z.array(z.string().min(1)).min(1).max(500);

export const deployScopeSchema = z
  .object({
    sourceProjectId: z.string().min(1).optional(),
    languageId: z.string().min(1).optional(),
  })
  .strict();

export type DeployScope = z.infer<typeof deployScopeSchema>;

export const deployTargetSchema = z.union([
  z.object({ versionIds: versionIdsSchema }).strict(),
  z.object({ scope: deployScopeSchema }).strict(),
]);

export type DeployTarget = z.infer<typeof deployTargetSchema>;

export const historyFilterSchema = z
  .object({
    documentVersionId: z.string().min(1).optional(),
    sourceProjectId: z.string().min(1).optional(),
    languageId: z.string().min(1).optional(),
  })
  .strict();

export type HistoryFilter = z.infer<typeof historyFilterSchema>;

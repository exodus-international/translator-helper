// Client-safe DocumentStatus enum values (string literals)
// This file can be safely imported in client components without bundling Prisma Client

export const DocumentStatus = {
  PENDING_TRANSLATION: 'PENDING_TRANSLATION',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  DEPLOYED: 'DEPLOYED',
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

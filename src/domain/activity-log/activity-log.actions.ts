'use server';

import { authorize } from '@/lib/authorize';
import { getActivityLogsByDocumentVersion, getActivityLogById, getRecentActivityLogs } from './activity-log.repository';

export async function getActivityLogsByDocumentVersionAction(documentVersionId: string) {
  await authorize('authenticated');
  return await getActivityLogsByDocumentVersion(documentVersionId);
}

export async function getActivityLogAction(id: string) {
  await authorize('authenticated');
  return await getActivityLogById(id);
}

export async function getRecentActivityLogsAction(limit?: number) {
  await authorize('authenticated');
  return await getRecentActivityLogs(limit);
}

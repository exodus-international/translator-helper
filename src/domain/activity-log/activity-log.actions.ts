"use server";

import { requireUser } from "@/lib/session";
import {
  getActivityLogsByDocumentVersion,
  getActivityLogById,
  getRecentActivityLogs,
} from "./activity-log.repository";

export async function getActivityLogsByDocumentVersionAction(
  documentVersionId: string
) {
  await requireUser();
  return await getActivityLogsByDocumentVersion(documentVersionId);
}

export async function getActivityLogAction(id: string) {
  await requireUser();
  return await getActivityLogById(id);
}

export async function getRecentActivityLogsAction(limit?: number) {
  await requireUser();
  return await getRecentActivityLogs(limit);
}

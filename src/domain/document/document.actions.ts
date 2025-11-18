"use server";

import { requireUser } from "@/lib/session";
import { createDocumentSchema, updateDocumentSchema } from "./document.types";
import {
  listDocuments,
  getDocumentById,
  getDocumentBySlug,
  createDocument,
  updateDocument,
  deleteDocument,
  getDocumentsNeedingTranslation,
  getDocumentsPendingReview,
  getDocumentsReadyToDeploy,
  getDocumentsByUser,
  getDocumentsWithAllVersions,
  getDashboardDocuments,
} from "./document.repository";
import { createDocumentVersion } from "../document-version/document-version.repository";
import { DocumentStatus } from "@prisma/client";
import { createActivityLog } from "../activity-log/activity-log.repository";
import prisma from "@/lib/db";

export async function listDocumentsAction(filters?: {
  sourceProjectId?: string;
  folderId?: string; // Deprecated - kept for backward compatibility
  labels?: string[];
  search?: string;
}) {
  await requireUser();
  return await listDocuments(filters);
}

export async function getDocumentAction(id: string) {
  await requireUser();
  return await getDocumentById(id);
}

export async function getDocumentBySlugAction(slug: string) {
  await requireUser();
  return await getDocumentBySlug(slug);
}

export async function createDocumentAction(input: unknown) {
  const user = await requireUser();
  const validated = createDocumentSchema.parse(input);

  // Create the document
  const document = await createDocument({
    slug: validated.slug,
    title: validated.title,
    sourceProjectId: validated.sourceProjectId,
    folderId: validated.folderId, // Deprecated - kept for backward compatibility
    labels: validated.labels,
    deadline: validated.deadline,
  });

  // Create the English (source) version with APPROVED status
  // First, get the English language ID
  const englishLang = await prisma.language.findUnique({
    where: { code: "en" },
  });

  if (!englishLang) {
    throw new Error("English language not found in database");
  }

  const version = await createDocumentVersion({
    documentId: document.id,
    languageId: englishLang.id,
    content: validated.content,
    status: DocumentStatus.APPROVED,
    userId: user.id,
  });

  // Log the activity
  await createActivityLog({
    documentVersionId: version.id,
    userId: user.id,
    action: "created",
    details: { title: document.title, slug: document.slug },
  });

  return document;
}

export async function updateDocumentAction(id: string, input: unknown) {
  const user = await requireUser();
  const validated = updateDocumentSchema.parse(input);

  const document = await updateDocument(id, validated);

  return document;
}

export async function deleteDocumentAction(id: string) {
  const user = await requireUser();
  return await deleteDocument(id);
}

export async function getDocumentsNeedingTranslationAction(
  languageId: string,
  translationProjectId?: string
) {
  await requireUser();
  return await getDocumentsNeedingTranslation(languageId, translationProjectId);
}

export async function getDocumentsPendingReviewAction(
  languageId?: string,
  translationProjectId?: string
) {
  await requireUser();
  return await getDocumentsPendingReview(languageId, translationProjectId);
}

export async function getDocumentsReadyToDeployAction(
  languageId?: string,
  translationProjectId?: string
) {
  await requireUser();
  return await getDocumentsReadyToDeploy(languageId, translationProjectId);
}

export async function getDocumentsByUserAction(
  languageId?: string,
  translationProjectId?: string
) {
  const user = await requireUser();
  return await getDocumentsByUser(user.id, languageId, translationProjectId);
}

export async function getDocumentsWithAllVersionsAction() {
  await requireUser();
  return await getDocumentsWithAllVersions();
}

export async function getDashboardDocumentsAction(
  languageId: string,
  translationProjectId?: string
) {
  await requireUser();
  return await getDashboardDocuments(languageId, translationProjectId);
}

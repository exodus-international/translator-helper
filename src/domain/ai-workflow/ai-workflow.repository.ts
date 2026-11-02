import prisma from '@/lib/db';
import { userBrief } from '@/domain/user/user.select';
import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import { AI_USER_EMAIL, AI_USER_ID, MAX_AI_ATTEMPTS } from './ai-workflow.rules';
import type { AiStepVersion } from './ai-workflow.service';

let aiUserReady: Promise<unknown> | null = null;

/**
 * Makes sure the AI's user row exists. The migration creates it, but a
 * database reseeded since (the seed empties the user table first) has lost
 * it, and every draft, comment and log the AI writes points at it. Once per
 * process is enough.
 */
export function ensureAiUser(): Promise<unknown> {
  aiUserReady ??= prisma.user
    .upsert({
      where: { id: AI_USER_ID },
      create: { id: AI_USER_ID, email: AI_USER_EMAIL, name: 'AI Translator', onboarded: true },
      update: {},
    })
    .catch((error) => {
      aiUserReady = null;
      throw error;
    });
  return aiUserReady;
}

export async function loadAiStepVersion(versionId: string): Promise<AiStepVersion | null> {
  return prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      status: true,
      workflow: true,
      content: true,
      version: true,
      aiAttempts: true,
      documentId: true,
      language: { select: { name: true, code: true, translationInstructions: true } },
      document: { select: { title: true, originalFilename: true } },
    },
  });
}

/** The source-language text of a document, which every AI draft is translated from. */
export async function loadSourceText(documentId: string): Promise<{ content: string; languageName: string } | null> {
  const source = await prisma.documentVersion.findFirst({
    where: { documentId, language: { isSource: true } },
    select: { content: true, language: { select: { name: true } } },
  });
  return source ? { content: source.content, languageName: source.language.name } : null;
}

/**
 * `updateMany`, not `update`, because the row count is the lock: only one
 * caller moves the attempts from the value it read, and the status must still
 * be the one the step runs in.
 */
export async function claimAiStep(versionId: string, status: DocumentStatus, expectedAttempts: number): Promise<boolean> {
  const { count } = await prisma.documentVersion.updateMany({
    where: { id: versionId, status, aiAttempts: expectedAttempts },
    data: { aiAttempts: expectedAttempts + 1 },
  });
  return count > 0;
}

export async function releaseAiStep(versionId: string, attempts: number) {
  await prisma.documentVersion.update({ where: { id: versionId }, data: { aiAttempts: attempts } });
}

export async function clearAiStep(versionId: string) {
  await prisma.documentVersion.update({ where: { id: versionId }, data: { aiAttempts: 0, aiError: null } });
}

/** A final failure uses up the remaining attempts, so the sweep leaves it alone until Retry. */
export async function failAiStep(versionId: string, message: string, final: boolean) {
  await prisma.documentVersion.update({
    where: { id: versionId },
    data: { aiError: message, ...(final ? { aiAttempts: MAX_AI_ATTEMPTS } : {}) },
  });
}

/** Writes the AI's draft as a new revision. The AI stays the translator. */
export async function saveAiDraft(versionId: string, content: string): Promise<{ version: number }> {
  return prisma.documentVersion.update({
    where: { id: versionId },
    data: { content, version: { increment: 1 } },
    select: { version: true },
  });
}

export async function addReviewApproval(versionId: string, userId: string) {
  await prisma.reviewApproval.upsert({
    where: { documentVersionId_userId: { documentVersionId: versionId, userId } },
    create: { documentVersionId: versionId, userId },
    update: {},
  });
}

export async function removeReviewApproval(versionId: string, userId: string) {
  await prisma.reviewApproval.deleteMany({ where: { documentVersionId: versionId, userId } });
}

export async function listReviewApprovals(versionId: string) {
  return prisma.reviewApproval.findMany({
    where: { documentVersionId: versionId },
    select: { userId: true, createdAt: true, user: userBrief },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Hands every untouched version of a document to the AI workflow when its
 * language runs one. Untouched means PENDING_TRANSLATION with no text and no
 * translator. Returns the ids that moved.
 */
export async function startAiWorkflowForDocument(documentId: string): Promise<string[]> {
  const candidates = await prisma.documentVersion.findMany({
    where: {
      documentId,
      status: DocumentStatus.PENDING_TRANSLATION,
      userId: null,
      content: '',
      language: { workflow: TranslationWorkflow.AI, isSource: false },
    },
    select: { id: true },
  });
  return startAiWorkflowForVersions(candidates.map((candidate) => candidate.id));
}

/** Moves the given untouched versions into the AI workflow. Returns the ids that moved. */
export async function startAiWorkflowForVersions(versionIds: string[]): Promise<string[]> {
  if (versionIds.length === 0) return [];
  await ensureAiUser();
  const started: string[] = [];
  for (const id of versionIds) {
    const { count } = await prisma.documentVersion.updateMany({
      where: { id, status: DocumentStatus.PENDING_TRANSLATION, userId: null },
      data: {
        workflow: TranslationWorkflow.AI,
        status: DocumentStatus.AI_TRANSLATING,
        // The AI is the translator, so lists show who wrote the draft.
        userId: AI_USER_ID,
        aiAttempts: 0,
        aiError: null,
      },
    });
    if (count > 0) started.push(id);
  }
  return started;
}

/** How long a claimed step may run before the sweep assumes its runner died. */
const STEP_TIMEOUT_MS = 10 * 60_000;

/**
 * The AI-workflow versions with a step to run: never claimed, or claimed long
 * enough ago that the runner must have died or failed and is due a retry.
 * APPROVED versions qualify only until their first deploy; one moved back to
 * APPROVED from DEPLOYED is deployed again by hand.
 */
export async function findDueAiSteps(now: Date, limit = 20): Promise<string[]> {
  const stale = new Date(now.getTime() - STEP_TIMEOUT_MS);
  const rows = await prisma.documentVersion.findMany({
    where: {
      workflow: TranslationWorkflow.AI,
      aiAttempts: { lt: MAX_AI_ATTEMPTS },
      OR: [{ aiAttempts: 0 }, { updatedAt: { lt: stale } }],
      AND: [
        {
          OR: [
            { status: { in: [DocumentStatus.AI_TRANSLATING, DocumentStatus.AI_PREPARING_AUDIO] } },
            { status: DocumentStatus.APPROVED, githubCommits: { none: {} } },
          ],
        },
      ],
    },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });
  return rows.map((row) => row.id);
}

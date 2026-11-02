'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/db';
import { authorize } from '@/lib/authorize';
import { refuse } from '@/lib/action-refusal';
import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import {
  clearAiStep,
  listReviewApprovals,
  startAiWorkflowForVersions,
} from './ai-workflow.repository';
import { REQUIRED_TEXT_APPROVALS } from './ai-workflow.rules';
import { aiWorkflow, runAiSteps } from './ai-workflow.runtime';

async function loadVersion(versionId: string) {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { id: true, status: true, workflow: true, languageId: true, aiError: true, aiAttempts: true },
  });
  if (!version) throw new Error('Document version not found');
  return version;
}

function revalidateDocumentPage() {
  revalidatePath('/documents/[project]/[slug]/[lang]', 'page');
}

/** Runs the version's AI steps once this response has gone out, so nobody waits on the model. */
function runAfterResponse(versionIds: string[]) {
  if (versionIds.length === 0) return;
  after(async () => {
    await runAiSteps(versionIds);
  });
}

/**
 * A thumbs-up on the text of an AI-workflow version. In the AI workflow every
 * member of the language reviews, translators included, because the AI is the
 * translator. The second approval moves the version on.
 */
export async function approveTextAction(versionId: string) {
  const { user } = await authorize('authenticated');
  const version = await loadVersion(versionId);
  await authorize({ language: version.languageId, role: 'member' });

  const result = await aiWorkflow.approveText({ version, userId: user.id });
  if (!('refused' in result) && result.advancedTo) runAfterResponse([version.id]);
  revalidateDocumentPage();
  return result;
}

export async function withdrawTextApprovalAction(versionId: string) {
  const { user } = await authorize('authenticated');
  const version = await loadVersion(versionId);
  await authorize({ language: version.languageId, role: 'member' });

  const result = await aiWorkflow.withdrawApproval({ version, userId: user.id });
  revalidateDocumentPage();
  return result;
}

/** Who has approved the text so far, and how many approvals it takes. */
export async function getTextApprovalsAction(versionId: string) {
  await authorize('authenticated');
  const version = await loadVersion(versionId);
  await authorize({ language: version.languageId, role: 'member' });

  const approvals = await listReviewApprovals(versionId);
  return {
    required: REQUIRED_TEXT_APPROVALS,
    approvals: approvals.map((approval) => ({ user: approval.user, createdAt: approval.createdAt })),
  };
}

/**
 * Runs a failed AI step again from the start, with a fresh set of attempts.
 * The language's manager decides that, as they decide a deploy.
 */
export async function retryAiStepAction(versionId: string) {
  await authorize('authenticated');
  const version = await loadVersion(versionId);
  await authorize({ language: version.languageId, role: 'manager' });

  if (version.workflow !== TranslationWorkflow.AI || !version.aiError) {
    return refuse('There is no failed AI step to retry. The page now shows where the document is.');
  }
  await clearAiStep(version.id);
  runAfterResponse([version.id]);
  revalidateDocumentPage();
  return { retried: true as const };
}

/**
 * Hands one waiting version to the AI workflow by hand: a document uploaded
 * before its language switched to the AI workflow, say. Only a version nobody
 * has started moves.
 */
export async function startAiTranslationAction(versionId: string) {
  await authorize('authenticated');
  const version = await loadVersion(versionId);
  await authorize({ language: version.languageId, role: 'manager' });

  const language = await prisma.language.findUnique({ where: { id: version.languageId }, select: { workflow: true } });
  if (language?.workflow !== TranslationWorkflow.AI) {
    return refuse('This language does not use the AI workflow.');
  }
  if (version.status !== DocumentStatus.PENDING_TRANSLATION) {
    return refuse('Only a translation nobody has started can go to the AI workflow.');
  }

  const started = await startAiWorkflowForVersions([version.id]);
  if (started.length === 0) {
    return refuse('Someone started this translation meanwhile, so it stays with them.');
  }
  runAfterResponse(started);
  revalidateDocumentPage();
  return { started: true as const };
}

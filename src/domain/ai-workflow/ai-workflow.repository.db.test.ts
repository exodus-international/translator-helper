/**
 * The AI workflow's queries against the seeded database: handing untouched
 * versions to the AI, the claim that keeps a step from running twice, what
 * the sweep picks up, the approvals, and My Work for the team.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { seededDocument, seededLanguage } from '../../../tests/seeded';
import { getWorkVersionsForUser } from '../document-version/document-version.repository';
import {
  addReviewApproval,
  claimAiStep,
  ensureAiUser,
  failAiStep,
  findDueAiSteps,
  listReviewApprovals,
  releaseAiStep,
  removeReviewApproval,
  startAiWorkflowForDocument,
} from './ai-workflow.repository';
import { AI_USER_ID, MAX_AI_ATTEMPTS } from './ai-workflow.rules';

let versionId: string;
let croatianId: string;
let documentId: string;
let originalWorkflow: TranslationWorkflow;

before(async () => {
  const reference = await seededDocument('ex90-markdown-reference');
  const croatian = await seededLanguage('hr');
  documentId = reference.id;
  croatianId = croatian.id;
  originalWorkflow = croatian.workflow;
  await prisma.language.update({ where: { id: croatian.id }, data: { workflow: TranslationWorkflow.AI } });
  const version = await prisma.documentVersion.create({
    data: { documentId, languageId: croatianId, content: '', status: DocumentStatus.PENDING_TRANSLATION, version: 1 },
  });
  versionId = version.id;
});

after(async () => {
  await prisma.documentVersion.deleteMany({ where: { id: versionId } });
  await prisma.language.update({ where: { id: croatianId }, data: { workflow: originalWorkflow } });
  await prisma.$disconnect();
});

describe('the AI workflow repository', () => {
  it('restores the AI user when a reseed removed it', async () => {
    await ensureAiUser();
    const user = await prisma.user.findUnique({ where: { id: AI_USER_ID } });
    assert.equal(user?.name, 'AI Translator');
  });

  it('hands an untouched version in an AI language to the AI, and leaves manual languages alone', async () => {
    const started = await startAiWorkflowForDocument(documentId);
    assert.deepEqual(started, [versionId]);

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    assert.equal(version.status, DocumentStatus.AI_TRANSLATING);
    assert.equal(version.workflow, TranslationWorkflow.AI);
    assert.equal(version.userId, AI_USER_ID);

    assert.deepEqual(await startAiWorkflowForDocument(documentId), [], 'a second call finds nothing untouched');
  });

  it('lets one runner claim a step, and puts the attempts back after a wait', async () => {
    assert.equal(await claimAiStep(versionId, DocumentStatus.AI_TRANSLATING, 0), true);
    assert.equal(await claimAiStep(versionId, DocumentStatus.AI_TRANSLATING, 0), false, 'the second runner loses');
    assert.equal(await claimAiStep(versionId, DocumentStatus.AI_PREPARING_AUDIO, 1), false, 'the status must match');
    await releaseAiStep(versionId, 0);
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    assert.equal(version.aiAttempts, 0);
  });

  it('sweeps a step nobody claimed, and a claimed one only once it has run too long', async () => {
    const now = new Date();
    assert.ok((await findDueAiSteps(now, 500)).includes(versionId));

    await claimAiStep(versionId, DocumentStatus.AI_TRANSLATING, 0);
    assert.ok(!(await findDueAiSteps(now, 500)).includes(versionId), 'running right now');
    assert.ok((await findDueAiSteps(new Date(now.getTime() + 11 * 60_000), 500)).includes(versionId), 'stalled');
  });

  it('leaves a step that failed for good to a person', async () => {
    await failAiStep(versionId, 'The frontmatter does not parse', true);
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    assert.equal(version.aiAttempts, MAX_AI_ATTEMPTS);
    assert.equal(version.aiError, 'The frontmatter does not parse');
    assert.ok(!(await findDueAiSteps(new Date(Date.now() + 60 * 60_000), 500)).includes(versionId));
  });

  it('counts one approval per person and takes it back', async () => {
    const member = await prisma.userLanguage.findFirstOrThrow({ where: { languageId: croatianId } });
    await addReviewApproval(versionId, member.userId);
    await addReviewApproval(versionId, member.userId);
    assert.deepEqual(
      (await listReviewApprovals(versionId)).map((approval) => approval.userId),
      [member.userId],
    );
    await removeReviewApproval(versionId, member.userId);
    assert.deepEqual(await listReviewApprovals(versionId), []);
  });

  it('puts the text in My Work for the team until they approve it', async () => {
    const member = await prisma.userLanguage.findFirstOrThrow({ where: { languageId: croatianId } });
    await prisma.documentVersion.update({ where: { id: versionId }, data: { status: DocumentStatus.PENDING_REVIEW } });

    const ids = async () => (await getWorkVersionsForUser(member.userId)).map((version) => version.id);
    assert.ok((await ids()).includes(versionId));

    await addReviewApproval(versionId, member.userId);
    assert.ok(!(await ids()).includes(versionId), 'approved, so no longer waiting on them');

    await prisma.documentVersion.update({ where: { id: versionId }, data: { status: DocumentStatus.AUDIO_REVIEW } });
    assert.ok((await ids()).includes(versionId), 'the audio text waits on everyone');
  });
});

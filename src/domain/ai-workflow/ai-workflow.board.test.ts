import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import { aiCardStep } from './ai-workflow.board';

const AI = TranslationWorkflow.AI;

describe('aiCardStep', () => {
  it('says nothing about a manual version', () => {
    assert.equal(aiCardStep({ workflow: TranslationWorkflow.MANUAL, status: DocumentStatus.PENDING_REVIEW }), null);
  });

  it('names the AI step the board folds into a column', () => {
    assert.deepEqual(aiCardStep({ workflow: AI, status: DocumentStatus.AI_TRANSLATING }), {
      label: 'AI drafting',
      tone: 'working',
    });
    assert.equal(aiCardStep({ workflow: AI, status: DocumentStatus.AI_PREPARING_AUDIO })?.label, 'AI preparing audio');
    assert.equal(aiCardStep({ workflow: AI, status: DocumentStatus.AUDIO_REVIEW })?.label, 'Audio check');
  });

  it('counts the approvals while the text is in review', () => {
    assert.deepEqual(aiCardStep({ workflow: AI, status: DocumentStatus.PENDING_REVIEW, approvalCount: 1 }), {
      label: '1/2 approvals',
      tone: 'waiting',
    });
  });

  it('puts a failed step before everything else', () => {
    assert.deepEqual(
      aiCardStep({ workflow: AI, status: DocumentStatus.APPROVED, aiError: 'GitHub refused the commit' }),
      { label: 'AI step failed', tone: 'failed' },
    );
  });
});

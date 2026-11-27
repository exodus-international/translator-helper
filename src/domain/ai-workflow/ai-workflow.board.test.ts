import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import { aiCardStep, boardColumnFor, boardColumns } from './ai-workflow.board';

const AI = TranslationWorkflow.AI;

describe('aiCardStep', () => {
  it('says nothing about a manual version', () => {
    assert.equal(aiCardStep({ workflow: TranslationWorkflow.MANUAL, status: DocumentStatus.PENDING_REVIEW }), null);
  });

  it('names the AI step the board folds into a column', () => {
    assert.deepEqual(aiCardStep({ workflow: AI, status: DocumentStatus.AI_TRANSLATING }), {
      actor: 'ai',
      label: 'Drafting',
      tone: 'working',
    });
    assert.equal(aiCardStep({ workflow: AI, status: DocumentStatus.AI_PREPARING_AUDIO })?.label, 'Preparing audio');
    assert.equal(aiCardStep({ workflow: AI, status: DocumentStatus.AUDIO_REVIEW })?.label, 'Audio check');
  });

  it('says who each step waits on', () => {
    const actor = (status: DocumentStatus) => aiCardStep({ workflow: AI, status })?.actor;
    assert.equal(actor(DocumentStatus.AI_TRANSLATING), 'ai');
    assert.equal(actor(DocumentStatus.PENDING_REVIEW), 'team');
    assert.equal(actor(DocumentStatus.AI_PREPARING_AUDIO), 'ai');
    assert.equal(actor(DocumentStatus.AUDIO_REVIEW), 'team');
    assert.equal(actor(DocumentStatus.APPROVED), 'app');
    assert.equal(actor(DocumentStatus.DEPLOYED), null);
  });

  it('counts the approvals while the text is in review', () => {
    assert.deepEqual(aiCardStep({ workflow: AI, status: DocumentStatus.PENDING_REVIEW, approvalCount: 1 }), {
      actor: 'team',
      label: '1/2 approvals',
      tone: 'waiting',
    });
  });

  it('puts a failed step before everything else', () => {
    assert.deepEqual(
      aiCardStep({ workflow: AI, status: DocumentStatus.APPROVED, aiError: 'GitHub refused the commit' }),
      { actor: 'app', label: 'Step failed', tone: 'failed' },
    );
  });
});

describe('boardColumns', () => {
  const MANUAL = TranslationWorkflow.MANUAL;

  it('keeps the five columns of a manual language', () => {
    assert.deepEqual(boardColumns(MANUAL, []), ['pending', 'in-progress', 'review', 'approved', 'deployed']);
  });

  it('starts an AI language at the first step that waits on a person', () => {
    assert.deepEqual(boardColumns(AI, [DocumentStatus.PENDING_REVIEW, DocumentStatus.AI_TRANSLATING]), [
      'review',
      'audio',
      'approved',
      'deployed',
    ]);
  });

  it('brings Not Started back while a document waits to be handed to the AI', () => {
    assert.equal(boardColumns(AI, [DocumentStatus.PENDING_TRANSLATION])[0], 'pending');
    // A document with no version in this language yet.
    assert.equal(boardColumns(AI, [undefined])[0], 'pending');
  });

  it('brings In Progress back while a translator still has a version open', () => {
    assert.deepEqual(boardColumns(AI, [DocumentStatus.IN_PROGRESS]).slice(0, 2), ['in-progress', 'review']);
  });
});

describe('boardColumnFor', () => {
  it('puts a document with no version under Not Started', () => {
    assert.equal(boardColumnFor(null, AI), 'pending');
  });

  it('keeps the AI draft in In Review on an AI board, and gives the audio steps one column', () => {
    assert.equal(boardColumnFor(DocumentStatus.AI_TRANSLATING, AI), 'review');
    assert.equal(boardColumnFor(DocumentStatus.AI_PREPARING_AUDIO, AI), 'audio');
    assert.equal(boardColumnFor(DocumentStatus.AUDIO_REVIEW, AI), 'audio');
    assert.equal(boardColumnFor(DocumentStatus.PENDING_REVIEW, AI), 'review');
  });

  it('folds the AI steps into the manual columns on a manual board', () => {
    const MANUAL = TranslationWorkflow.MANUAL;
    assert.equal(boardColumnFor(DocumentStatus.AI_TRANSLATING, MANUAL), 'in-progress');
    assert.equal(boardColumnFor(DocumentStatus.AUDIO_REVIEW, MANUAL), 'review');
  });

  it('never sends a card to a column the board left out', () => {
    const statuses = Object.values(DocumentStatus);
    for (const workflow of [AI, TranslationWorkflow.MANUAL]) {
      // One document at a time: the worst case for a column that shows only when needed.
      for (const status of [...statuses, null]) {
        assert.ok(boardColumns(workflow, [status]).includes(boardColumnFor(status, workflow)), String(status));
      }
    }
  });
});

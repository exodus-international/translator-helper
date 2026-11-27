import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import { aiWorkflowSteps } from './ai-workflow.steps';

const states = (status: DocumentStatus, hasAudio = true, aiError: string | null = null) =>
  aiWorkflowSteps({ status, hasAudio, aiError }).map((step) => `${step.id}:${step.state}`);

describe('aiWorkflowSteps', () => {
  it('says who does each step, in order', () => {
    const steps = aiWorkflowSteps({ status: DocumentStatus.AI_TRANSLATING, hasAudio: true });
    assert.deepEqual(
      steps.map((step) => step.actor),
      ['ai', 'team', 'ai', 'team', 'app'],
    );
  });

  it('puts the document on the AI draft while the AI translates', () => {
    assert.deepEqual(states(DocumentStatus.AI_TRANSLATING), [
      'draft:current',
      'text-review:upcoming',
      'audio-text:upcoming',
      'audio-review:upcoming',
      'deploy:upcoming',
    ]);
  });

  it('shows the draft as done while the team reviews the text', () => {
    assert.deepEqual(states(DocumentStatus.PENDING_REVIEW), [
      'draft:done',
      'text-review:current',
      'audio-text:upcoming',
      'audio-review:upcoming',
      'deploy:upcoming',
    ]);
  });

  it('follows the document through both audio steps', () => {
    assert.equal(states(DocumentStatus.AI_PREPARING_AUDIO)[2], 'audio-text:current');
    assert.deepEqual(states(DocumentStatus.AUDIO_REVIEW).slice(2), [
      'audio-text:done',
      'audio-review:current',
      'deploy:upcoming',
    ]);
  });

  it('leaves the audio steps out of a document that gets no audio', () => {
    assert.deepEqual(states(DocumentStatus.PENDING_REVIEW, false), [
      'draft:done',
      'text-review:current',
      'deploy:upcoming',
    ]);
  });

  it('keeps the audio step a document stands on, even when it reads as having no audio', () => {
    assert.ok(states(DocumentStatus.AUDIO_REVIEW, false).includes('audio-review:current'));
  });

  it('stands on the last step while the app records and deploys', () => {
    assert.equal(states(DocumentStatus.APPROVED).at(-1), 'deploy:current');
  });

  it('shows every step done once the document is deployed', () => {
    assert.ok(states(DocumentStatus.DEPLOYED).every((state) => state.endsWith(':done')));
  });

  it('marks the step the document stands on as failed', () => {
    assert.deepEqual(states(DocumentStatus.AI_PREPARING_AUDIO, true, 'The model timed out').slice(1, 4), [
      'text-review:done',
      'audio-text:failed',
      'audio-review:upcoming',
    ]);
  });

  it('puts a GitHub failure after the deploy on the last step', () => {
    assert.equal(states(DocumentStatus.DEPLOYED, true, 'GitHub refused the pull request').at(-1), 'deploy:failed');
  });
});

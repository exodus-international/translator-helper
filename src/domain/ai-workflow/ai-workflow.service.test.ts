import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus, SuggestionType, TranslationWorkflow } from '@/generated/prisma/enums';
import { isRefusal } from '@/lib/action-refusal';
import { StatusTransitionRefusedError, validateTransition } from '../document-version/document-version.transitions';
import { AI_USER_ID, MAX_AI_ATTEMPTS } from './ai-workflow.rules';
import { createAiWorkflow, type AiStepVersion, type AiWorkflowDeps } from './ai-workflow.service';

type Call = { fn: string; args: unknown[] };

const DERIVED = '<speak><voice name="cs-CZ-AntoninNeural">Den 1 [1] <break time="1000ms"/> Modli se.</voice></speak>';
const PREPARED = '<speak><voice name="cs-CZ-AntoninNeural">Den 1 <break time="1000ms"/> Modli se.</voice></speak>';

function aiVersion(status: DocumentStatus, overrides: Partial<AiStepVersion> = {}): AiStepVersion {
  return {
    id: 'version-1',
    status,
    workflow: TranslationWorkflow.AI,
    content: '---\ntitle: Den 1\n---\n\nModli se.',
    version: 1,
    aiAttempts: 0,
    documentId: 'doc-1',
    language: { name: 'Czech', code: 'cs', translationInstructions: 'Tykej.' },
    document: { title: 'Day 1', originalFilename: '1.md' },
    ...overrides,
  };
}

function fakeDeps(initial: AiStepVersion | null, overrides: Partial<AiWorkflowDeps> = {}) {
  const calls: Call[] = [];
  let version = initial;
  const approvals = new Set<string>();
  const record = (fn: string, ...args: unknown[]) => {
    calls.push({ fn, args });
  };

  const deps: AiWorkflowDeps = {
    loadVersion: async () => version,
    loadSource: async () => ({ content: '---\ntitle: Day 1\n---\n\nPray.', languageName: 'English' }),
    claim: async (_id, status, expected) => {
      record('claim', status, expected);
      return true;
    },
    release: async (_id, attempts) => record('release', attempts),
    succeed: async () => record('succeed'),
    fail: async (_id, message, opts) => record('fail', message, opts?.final ?? false),
    saveDraft: async (_id, content) => {
      record('saveDraft', content);
      return { version: 2 };
    },
    clearAiNotes: async () => record('clearAiNotes'),
    hasDeployed: async () => false,
    redeploy: async () => record('redeploy'),
    createNote: async (note) => record('createNote', note),
    countOpenSuggestions: async () => 0,
    addApproval: async (_id, userId) => {
      approvals.add(userId);
      record('addApproval', userId);
    },
    removeApproval: async (_id, userId) => {
      approvals.delete(userId);
      record('removeApproval', userId);
    },
    listApprovals: async () => [...approvals].map((userId) => ({ userId })),
    isAudioEligible: async () => true,
    deriveAudioText: async () => ({ ssml: DERIVED, baseline: 'fp-1' }),
    saveAudioText: async (_id, ssml, baseline) => record('saveAudioText', ssml, baseline),
    validateSsml: () => [],
    voiceOf: (ssml) => /name="([^"]+)"/.exec(ssml)?.[1] ?? null,
    audioReadiness: async () => ({ state: 'ready', url: 'https://audio.example/1.mp3' }),
    translate: async () => ({
      translation: '---\ntitle: Den 1\n---\n\nModli se.',
      notes: [
        { quote: 'Modli se.', comment: 'Imperative or reflexive?', suggestion: 'Pomodli se.' },
        { quote: 'not in the text', comment: 'Is "Pray" a heading?', suggestion: 'Modlitba' },
      ],
    }),
    prepareAudioText: async () => PREPARED,
    changeStatus: async (input) => {
      // The real transition rules, so a move the workflow refuses fails here too.
      validateTransition(input.version.status, input.to, {
        workflow: input.version.workflow,
        by: input.by,
        openSuggestionsCount: 0,
      });
      record('changeStatus', input.to, input.actorId);
      if (version) version = { ...version, status: input.to };
      return { version: {}, ...(input.to === DocumentStatus.DEPLOYED ? { github: { status: 'success' as const } } : {}) };
    },
    enableAutoMerge: async () => record('enableAutoMerge'),
    log: async (entry) => record(`log:${entry.action}`),
    ...overrides,
  };
  return { deps, calls, workflow: createAiWorkflow(deps), approvals };
}

const fns = (calls: Call[]) => calls.map((call) => call.fn);
const inReview = { id: 'version-1', status: DocumentStatus.PENDING_REVIEW, workflow: TranslationWorkflow.AI };

describe('approveText', () => {
  it('records the first approval and leaves the version in review', async () => {
    const { workflow, calls } = fakeDeps(null);
    const result = await workflow.approveText({ version: inReview, userId: 'anna' });
    assert.ok(!isRefusal(result));
    assert.deepEqual(result, { approverIds: ['anna'] });
    assert.ok(!fns(calls).includes('changeStatus'));
  });

  it('moves the version to the audio step on the second approval', async () => {
    const { workflow, calls } = fakeDeps(null);
    await workflow.approveText({ version: inReview, userId: 'anna' });
    const result = await workflow.approveText({ version: inReview, userId: 'ben' });
    assert.ok(!isRefusal(result));
    assert.equal(result.advancedTo, DocumentStatus.AI_PREPARING_AUDIO);
    assert.deepEqual(calls.find((call) => call.fn === 'changeStatus')?.args, [DocumentStatus.AI_PREPARING_AUDIO, 'ben']);
  });

  it('counts one person once, however often they approve', async () => {
    const { workflow } = fakeDeps(null);
    await workflow.approveText({ version: inReview, userId: 'anna' });
    const result = await workflow.approveText({ version: inReview, userId: 'anna' });
    assert.deepEqual(result, { approverIds: ['anna'] });
  });

  it('goes straight to approved when the document gets no audio', async () => {
    const { workflow } = fakeDeps(null, { isAudioEligible: async () => false });
    await workflow.approveText({ version: inReview, userId: 'anna' });
    const result = await workflow.approveText({ version: inReview, userId: 'ben' });
    assert.ok(!isRefusal(result));
    assert.equal(result.advancedTo, DocumentStatus.APPROVED);
  });

  it('refuses while comments are open, and records nothing', async () => {
    const { workflow, calls } = fakeDeps(null, { countOpenSuggestions: async () => 2 });
    const result = await workflow.approveText({ version: inReview, userId: 'anna' });
    assert.ok(isRefusal(result));
    assert.equal(result.refused.reason, 'open_suggestions');
    assert.deepEqual(calls, []);
  });

  it('refuses a version that is not in AI text review', async () => {
    const { workflow } = fakeDeps(null);
    for (const version of [
      { ...inReview, workflow: TranslationWorkflow.MANUAL },
      { ...inReview, status: DocumentStatus.AUDIO_REVIEW },
    ]) {
      const result = await workflow.approveText({ version, userId: 'anna' });
      assert.ok(isRefusal(result));
      assert.equal(result.refused.reason, 'not_in_text_review');
    }
  });

  it('shrugs off a race where the other approval already moved the version', async () => {
    const { workflow } = fakeDeps(null, {
      changeStatus: async () => {
        throw new StatusTransitionRefusedError('moved', 'not_allowed');
      },
    });
    await workflow.approveText({ version: inReview, userId: 'anna' });
    const result = await workflow.approveText({ version: inReview, userId: 'ben' });
    assert.deepEqual(result, { approverIds: ['anna', 'ben'] });
  });
});

describe('approveText when a comment opens meanwhile', () => {
  it('takes the approval back and refuses, so approving again moves the text on', async () => {
    const { workflow, calls, approvals } = fakeDeps(null, {
      changeStatus: async () => {
        throw new StatusTransitionRefusedError('open', 'open_suggestions');
      },
    });
    await workflow.approveText({ version: inReview, userId: 'anna' });
    const result = await workflow.approveText({ version: inReview, userId: 'ben' });
    assert.ok(isRefusal(result));
    assert.equal(result.refused.reason, 'open_suggestions');
    assert.deepEqual([...approvals], ['anna']);
    assert.ok(fns(calls).includes('removeApproval'));
  });
});

describe('withdrawApproval', () => {
  it('takes the approval back while the text is in review', async () => {
    const { workflow } = fakeDeps(null);
    await workflow.approveText({ version: inReview, userId: 'anna' });
    assert.deepEqual(await workflow.withdrawApproval({ version: inReview, userId: 'anna' }), { approverIds: [] });
  });

  it('refuses once the text has moved on', async () => {
    const { workflow } = fakeDeps(null);
    const result = await workflow.withdrawApproval({
      version: { ...inReview, status: DocumentStatus.AI_PREPARING_AUDIO },
      userId: 'anna',
    });
    assert.ok(isRefusal(result));
  });
});

describe('runStep: drafting', () => {
  it('saves the draft, turns notes into comments and hands it to review', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_TRANSLATING));
    assert.equal(await workflow.runStep('version-1'), 'done');
    assert.deepEqual(fns(calls), [
      'claim',
      'saveDraft',
      'clearAiNotes',
      'createNote',
      'createNote',
      'changeStatus',
      'succeed',
    ]);
    assert.deepEqual(calls.find((call) => call.fn === 'changeStatus')?.args, [DocumentStatus.PENDING_REVIEW, AI_USER_ID]);
  });

  it('anchors a note it can find as a change, and keeps one it cannot as a comment with the quote', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_TRANSLATING));
    await workflow.runStep('version-1');
    const [anchored, loose] = calls.filter((call) => call.fn === 'createNote').map((call) => call.args[0] as any);
    assert.equal(anchored.type, SuggestionType.CHANGE);
    assert.equal(anchored.proposedText, 'Pomodli se.');
    assert.deepEqual(anchored.range, { startLine: 5, startColumn: 1, endLine: 5, endColumn: 10 });
    assert.equal(anchored.version, 2);
    assert.equal(loose.type, SuggestionType.COMMENT);
    assert.equal(loose.range, null);
    assert.equal(loose.proposedText, null);
    assert.match(loose.comment, /^"not in the text": /);
  });

  it('records a failure to retry, without moving the version', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_TRANSLATING), {
      translate: async () => {
        throw new Error('ChatGPT API request failed: 429');
      },
    });
    assert.equal(await workflow.runStep('version-1'), 'failed');
    assert.deepEqual(calls.find((call) => call.fn === 'fail')?.args, ['ChatGPT API request failed: 429', false]);
    assert.ok(!fns(calls).includes('changeStatus'));
  });

  it('refuses to translate an empty source', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_TRANSLATING), {
      loadSource: async () => ({ content: ' ', languageName: 'English' }),
    });
    assert.equal(await workflow.runStep('version-1'), 'failed');
    assert.ok(!fns(calls).includes('translate'));
  });
});

describe('runStep: claiming', () => {
  it('does nothing when someone else is already running the step', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_TRANSLATING), { claim: async () => false });
    assert.equal(await workflow.runStep('version-1'), 'skipped');
    assert.deepEqual(calls, []);
  });

  it('leaves a step that has failed too often for a person', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_TRANSLATING, { aiAttempts: MAX_AI_ATTEMPTS }));
    assert.equal(await workflow.runStep('version-1'), 'skipped');
    assert.deepEqual(calls, []);
  });

  it('ignores manual versions and statuses with no AI step', async () => {
    for (const version of [
      aiVersion(DocumentStatus.AI_TRANSLATING, { workflow: TranslationWorkflow.MANUAL }),
      aiVersion(DocumentStatus.PENDING_REVIEW),
      aiVersion(DocumentStatus.AUDIO_REVIEW),
      aiVersion(DocumentStatus.DEPLOYED),
    ]) {
      const { workflow, calls } = fakeDeps(version);
      assert.equal(await workflow.runStep('version-1'), 'skipped');
      assert.deepEqual(calls, []);
    }
  });
});

describe('runStep: audio text', () => {
  it('stores the prepared audio text with the fingerprint and hands it to audio review', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_PREPARING_AUDIO));
    assert.equal(await workflow.runStep('version-1'), 'done');
    assert.deepEqual(calls.find((call) => call.fn === 'saveAudioText')?.args, [PREPARED, 'fp-1']);
    assert.deepEqual(calls.find((call) => call.fn === 'changeStatus')?.args, [DocumentStatus.AUDIO_REVIEW, AI_USER_ID]);
  });

  it('refuses audio text that lost a pause, and retries', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_PREPARING_AUDIO), {
      prepareAudioText: async () => PREPARED.replace('<break time="1000ms"/>', ''),
    });
    assert.equal(await workflow.runStep('version-1'), 'failed');
    assert.ok(!fns(calls).includes('saveAudioText'));
    const [message, final] = calls.find((call) => call.fn === 'fail')!.args;
    assert.match(message as string, /pauses/);
    assert.equal(final, false);
  });

  it('moves on with no audio text when audio was switched off meanwhile', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.AI_PREPARING_AUDIO), { deriveAudioText: async () => null });
    assert.equal(await workflow.runStep('version-1'), 'done');
    assert.ok(!fns(calls).includes('saveAudioText'));
    assert.deepEqual(calls.find((call) => call.fn === 'changeStatus')?.args, [DocumentStatus.AUDIO_REVIEW, AI_USER_ID]);
  });
});

describe('runStep: automatic deploy', () => {
  it('leaves a version moved back from deployed for a person to deploy again', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED), { hasDeployed: async () => true });
    assert.equal(await workflow.runStep('version-1'), 'skipped');
    assert.deepEqual(calls, []);
  });

  it('deploys and turns on automatic merge', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED));
    assert.equal(await workflow.runStep('version-1'), 'done');
    assert.deepEqual(fns(calls), ['claim', 'changeStatus', 'enableAutoMerge', 'succeed']);
  });

  it('waits while the recording is still being made, without counting it as a failure', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED, { aiAttempts: 1 }), {
      audioReadiness: async () => ({ state: 'pending' }),
    });
    assert.equal(await workflow.runStep('version-1'), 'waiting');
    assert.deepEqual(fns(calls), ['claim', 'release']);
    assert.deepEqual(calls[1].args, [1]);
  });

  it('deploys when the recording failed, since the text does not depend on it', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED), {
      audioReadiness: async () => ({ state: 'failed' }),
    });
    assert.equal(await workflow.runStep('version-1'), 'done');
    assert.ok(fns(calls).includes('changeStatus'));
  });

  it('leaves a document that fails the checks for a person, without deploying', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED, { content: '---\ntitle: "Den\n---\n\nText.' }));
    assert.equal(await workflow.runStep('version-1'), 'failed');
    assert.ok(!fns(calls).includes('changeStatus'));
    const [message, final] = calls.find((call) => call.fn === 'fail')!.args;
    assert.match(message as string, /Not deployed automatically: The frontmatter does not parse/);
    assert.equal(final, true);
  });

  it('reports a failed pull request for a person, without turning on merge', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED), {
      changeStatus: async () => ({ version: {}, github: { status: 'failed', error: 'Branch "cs" does not exist' } }),
    });
    assert.equal(await workflow.runStep('version-1'), 'failed');
    assert.ok(!fns(calls).includes('enableAutoMerge'));
    assert.deepEqual(calls.find((call) => call.fn === 'fail')?.args, [
      'Deployed, but the GitHub pull request failed: Branch "cs" does not exist',
      true,
    ]);
  });

  it('skips automatic merge when the project is not deployed to GitHub', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED), {
      changeStatus: async () => ({ version: {}, github: { status: 'skipped' } }),
    });
    assert.equal(await workflow.runStep('version-1'), 'done');
    assert.ok(!fns(calls).includes('enableAutoMerge'));
  });

  it('reports a merge GitHub would not turn on, for a person', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED), {
      enableAutoMerge: async () => {
        throw new Error('Auto merge is not allowed for this repository');
      },
    });
    assert.equal(await workflow.runStep('version-1'), 'failed');
    const [message, final] = calls.find((call) => call.fn === 'fail')!.args;
    assert.match(message as string, /automatic merge could not be turned on: Auto merge is not allowed/);
    assert.equal(final, true);
  });
});

describe('retryDeploy', () => {
  it('opens the pull request again, turns on merge and clears the error', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.DEPLOYED));
    assert.equal(await workflow.retryDeploy('version-1'), 'done');
    assert.deepEqual(fns(calls), ['redeploy', 'enableAutoMerge', 'succeed']);
  });

  it('records GitHub failing again for a person', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.DEPLOYED), {
      enableAutoMerge: async () => {
        throw new Error('Auto merge is not allowed for this repository');
      },
    });
    assert.equal(await workflow.retryDeploy('version-1'), 'failed');
    assert.deepEqual(calls.find((call) => call.fn === 'fail')?.args, ['Auto merge is not allowed for this repository', true]);
  });

  it('does nothing to a version that is not deployed', async () => {
    const { workflow, calls } = fakeDeps(aiVersion(DocumentStatus.APPROVED));
    assert.equal(await workflow.retryDeploy('version-1'), 'skipped');
    assert.deepEqual(calls, []);
  });
});

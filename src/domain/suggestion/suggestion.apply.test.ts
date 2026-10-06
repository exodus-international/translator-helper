import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import { isRefusal } from '@/lib/action-refusal';
import {
  createApplySuggestion,
  planSuggestionApplication,
  SuggestionNotOpenError,
  type ApplicableSuggestion,
  type ApplySuggestionDeps,
} from './suggestion.apply';

const content = ['The call came early.', 'Nobody answered it.', 'So it came again.'].join('\n');

const change: ApplicableSuggestion = {
  id: 's1',
  status: SuggestionStatus.OPEN,
  type: SuggestionType.CHANGE,
  proposedText: 'summons',
  startLine: 1,
  startColumn: 5,
  endLine: 1,
  endColumn: 9,
};

describe('planSuggestionApplication', () => {
  it('replaces the range with the proposed text and keeps what was there', () => {
    const plan = planSuggestionApplication(change, content);
    assert.equal(plan.originalText, 'call');
    assert.equal(plan.newContent.split('\n')[0], 'The summons came early.');
    assert.deepEqual(plan.range, { startLine: 1, startColumn: 5, endLine: 1, endColumn: 9 });
  });

  it('refuses a suggestion that is not open', () => {
    assert.throws(
      () => planSuggestionApplication({ ...change, status: SuggestionStatus.APPLIED }, content),
      (error) => error instanceof SuggestionNotOpenError && /Only open/.test(error.message),
    );
  });

  it('refuses a comment, which proposes nothing', () => {
    assert.throws(() => planSuggestionApplication({ ...change, type: SuggestionType.COMMENT }, content), /Only CHANGE/);
  });

  it('refuses a change with no proposed text', () => {
    assert.throws(() => planSuggestionApplication({ ...change, proposedText: '' }, content), /proposed text/);
  });

  it('refuses a change with no range', () => {
    assert.throws(() => planSuggestionApplication({ ...change, endColumn: null }, content), /without a text range/);
  });

  it('refuses a range past the end of the text as it is now', () => {
    assert.throws(() => planSuggestionApplication({ ...change, startLine: 4, endLine: 4 }, content), /out of bounds/);
  });
});

describe('applySuggestion', () => {
  it('writes the new text, marks the suggestion applied with the old text, logs and refreshes', async () => {
    const calls: { fn: string; args: unknown[] }[] = [];
    const deps: ApplySuggestionDeps<{ id: string; content: string }> = {
      updateVersion: async (versionId, text, userId) => {
        calls.push({ fn: 'updateVersion', args: [versionId, text, userId] });
        return { id: versionId, content: text };
      },
      markApplied: async (suggestionId, originalText) => {
        calls.push({ fn: 'markApplied', args: [suggestionId, originalText] });
      },
      log: async (entry) => {
        calls.push({ fn: 'log', args: [entry] });
      },
      revalidateDocumentPage: () => {
        calls.push({ fn: 'revalidate', args: [] });
      },
    };
    const applySuggestion = createApplySuggestion(deps);

    const version = await applySuggestion({
      suggestion: change,
      versionId: 'v1',
      content,
      currentVersion: { id: 'v1', content },
      actorId: 'me',
    });

    assert.ok(!isRefusal(version));
    assert.equal(version.content.split('\n')[0], 'The summons came early.');
    assert.deepEqual(
      calls.map((call) => call.fn),
      ['updateVersion', 'markApplied', 'log', 'revalidate'],
    );
    assert.deepEqual(calls[1].args, ['s1', 'call']);
    assert.deepEqual(calls[2].args, [
      {
        documentVersionId: 'v1',
        userId: 'me',
        action: 'applied_suggestion',
        details: { suggestionId: 's1', type: SuggestionType.CHANGE, range: change && { startLine: 1, startColumn: 5, endLine: 1, endColumn: 9 } },
      },
    ]);
  });

  function recordingWrites() {
    const writes: string[] = [];
    const applySuggestion = createApplySuggestion<{ id: string; content: string }>({
      updateVersion: async (id, text) => {
        writes.push('updateVersion');
        return { id, content: text };
      },
      markApplied: async () => {
        writes.push('markApplied');
      },
      log: async () => {
        writes.push('log');
      },
      revalidateDocumentPage: () => {
        writes.push('revalidate');
      },
    });
    return { writes, applySuggestion };
  }

  it('returns the version untouched when the suggestion is already applied, so a retry succeeds', async () => {
    const { writes, applySuggestion } = recordingWrites();
    const current = { id: 'v1', content: 'already changed' };
    const result = await applySuggestion({
      suggestion: { ...change, status: SuggestionStatus.APPLIED },
      versionId: 'v1',
      content: current.content,
      currentVersion: current,
      actorId: 'me',
    });
    assert.equal(result, current);
    assert.deepEqual(writes, []);
  });

  it('refuses a dismissed suggestion with a message for the person, and writes nothing', async () => {
    const { writes, applySuggestion } = recordingWrites();
    const result = await applySuggestion({
      suggestion: { ...change, status: SuggestionStatus.DISMISSED },
      versionId: 'v1',
      content,
      currentVersion: { id: 'v1', content },
      actorId: 'me',
    });
    assert.ok(isRefusal(result));
    assert.match(result.refused.message, /no longer open/);
    assert.deepEqual(writes, []);
  });

  it('still throws for a suggestion that can never be applied, and writes nothing', async () => {
    const { writes, applySuggestion } = recordingWrites();
    await assert.rejects(
      applySuggestion({
        suggestion: { ...change, type: SuggestionType.COMMENT },
        versionId: 'v1',
        content,
        currentVersion: { id: 'v1', content },
        actorId: 'me',
      }),
      /Only CHANGE/,
    );
    assert.deepEqual(writes, []);
  });
});

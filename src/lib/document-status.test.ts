import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import { isDraftPhase, isTranslationStarted } from './document-status';

describe('isDraftPhase', () => {
  it('sends the drafting half, and a document with no version, to the translate editor', () => {
    assert.equal(isDraftPhase(null), true);
    assert.equal(isDraftPhase(DocumentStatus.PENDING_TRANSLATION), true);
    assert.equal(isDraftPhase(DocumentStatus.IN_PROGRESS), true);
  });

  it('sends the reviewing half to the review editor', () => {
    assert.equal(isDraftPhase(DocumentStatus.PENDING_REVIEW), false);
    assert.equal(isDraftPhase(DocumentStatus.APPROVED), false);
    assert.equal(isDraftPhase(DocumentStatus.DEPLOYED), false);
  });
});

describe('isTranslationStarted', () => {
  it('counts a version still at Not Started as not started', () => {
    // The regression this guards: a version row exists from the document list
    // or an assignment, so merely having one made the editor hide the call to
    // action -- on exactly the documents that needed it.
    assert.equal(isTranslationStarted(DocumentStatus.PENDING_TRANSLATION), false);
  });

  it('counts no version at all as not started', () => {
    assert.equal(isTranslationStarted(null), false);
    assert.equal(isTranslationStarted(undefined), false);
  });

  it('counts every status past Not Started as started', () => {
    for (const status of [
      DocumentStatus.IN_PROGRESS,
      DocumentStatus.PENDING_REVIEW,
      DocumentStatus.APPROVED,
      DocumentStatus.DEPLOYED,
    ]) {
      assert.equal(isTranslationStarted(status), true, status);
    }
  });
});

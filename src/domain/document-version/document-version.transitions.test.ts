import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@prisma/client';
import { validateTransition } from './document-version.transitions';

describe('validateTransition', () => {
  describe('valid forward transitions', () => {
    it('PENDING_TRANSLATION → IN_PROGRESS', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.PENDING_TRANSLATION, DocumentStatus.IN_PROGRESS),
      );
    });

    it('IN_PROGRESS → PENDING_REVIEW', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.IN_PROGRESS, DocumentStatus.PENDING_REVIEW),
      );
    });

    it('PENDING_REVIEW → APPROVED', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.PENDING_REVIEW, DocumentStatus.APPROVED, { openSuggestionsCount: 0 }),
      );
    });

    it('APPROVED → DEPLOYED', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.APPROVED, DocumentStatus.DEPLOYED, { openSuggestionsCount: 0 }),
      );
    });
  });

  describe('valid backward transitions', () => {
    it('IN_PROGRESS → PENDING_TRANSLATION', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.IN_PROGRESS, DocumentStatus.PENDING_TRANSLATION),
      );
    });

    it('PENDING_REVIEW → IN_PROGRESS', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.PENDING_REVIEW, DocumentStatus.IN_PROGRESS),
      );
    });

    it('APPROVED → PENDING_REVIEW', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.APPROVED, DocumentStatus.PENDING_REVIEW),
      );
    });

    it('DEPLOYED → APPROVED (no guard on backward transition)', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.DEPLOYED, DocumentStatus.APPROVED),
      );
    });
  });

  describe('invalid transitions', () => {
    it('PENDING_TRANSLATION → APPROVED (skip)', () => {
      assert.throws(
        () => validateTransition(DocumentStatus.PENDING_TRANSLATION, DocumentStatus.APPROVED),
        { message: /Invalid status transition/ },
      );
    });

    it('PENDING_TRANSLATION → DEPLOYED (skip)', () => {
      assert.throws(
        () => validateTransition(DocumentStatus.PENDING_TRANSLATION, DocumentStatus.DEPLOYED),
        { message: /Invalid status transition/ },
      );
    });

    it('DEPLOYED → IN_PROGRESS (skip backward)', () => {
      assert.throws(
        () => validateTransition(DocumentStatus.DEPLOYED, DocumentStatus.IN_PROGRESS),
        { message: /Invalid status transition/ },
      );
    });

    it('DEPLOYED → PENDING_TRANSLATION (skip backward)', () => {
      assert.throws(
        () => validateTransition(DocumentStatus.DEPLOYED, DocumentStatus.PENDING_TRANSLATION),
        { message: /Invalid status transition/ },
      );
    });

    it('same status is a no-op (throws)', () => {
      assert.throws(
        () => validateTransition(DocumentStatus.IN_PROGRESS, DocumentStatus.IN_PROGRESS),
        { message: /Invalid status transition/ },
      );
    });
  });

  describe('guards', () => {
    it('cannot approve with open suggestions', () => {
      assert.throws(
        () => validateTransition(DocumentStatus.PENDING_REVIEW, DocumentStatus.APPROVED, { openSuggestionsCount: 3 }),
        { message: /open suggestions/ },
      );
    });

    it('cannot deploy with open suggestions', () => {
      assert.throws(
        () => validateTransition(DocumentStatus.APPROVED, DocumentStatus.DEPLOYED, { openSuggestionsCount: 1 }),
        { message: /open suggestions/ },
      );
    });

    it('approve passes with zero open suggestions', () => {
      assert.doesNotThrow(() =>
        validateTransition(DocumentStatus.PENDING_REVIEW, DocumentStatus.APPROVED, { openSuggestionsCount: 0 }),
      );
    });

    it('approve without context throws (guard is mandatory)', () => {
      assert.throws(
        () => validateTransition(DocumentStatus.PENDING_REVIEW, DocumentStatus.APPROVED),
        { message: /requires context/ },
      );
    });
  });
});

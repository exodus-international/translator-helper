import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentStatus, ProjectRole } from '@/generated/prisma/enums';
import { reviewEditControls, reviewEditingFor } from './review-editing';

test('on a language without AI translation, everyone keeps the Scripture-only review', () => {
  for (const role of [ProjectRole.TRANSLATOR, ProjectRole.REVIEWER, ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER]) {
    assert.equal(reviewEditingFor({ autoTranslate: false, isAdmin: false, role }), 'scripture', role);
  }
  assert.equal(reviewEditingFor({ autoTranslate: false, isAdmin: true }), 'scripture');
});

test('on a language with AI translation, reviewers and up edit directly and a translator only reads', () => {
  assert.equal(reviewEditingFor({ autoTranslate: true, isAdmin: false, role: ProjectRole.REVIEWER }), 'direct');
  assert.equal(reviewEditingFor({ autoTranslate: true, isAdmin: false, role: ProjectRole.EDITOR }), 'direct');
  assert.equal(reviewEditingFor({ autoTranslate: true, isAdmin: false, role: ProjectRole.PROJECT_MANAGER }), 'direct');
  assert.equal(reviewEditingFor({ autoTranslate: true, isAdmin: true }), 'direct');
  assert.equal(reviewEditingFor({ autoTranslate: true, isAdmin: false, role: ProjectRole.TRANSLATOR }), 'none');
  assert.equal(reviewEditingFor({ autoTranslate: true, isAdmin: false }), 'none');
});

test('the Edit button shows only for direct editing of a version in review', () => {
  assert.deepEqual(reviewEditControls(DocumentStatus.PENDING_REVIEW, 'direct'), { canEdit: true, showEditButton: true });
  assert.deepEqual(reviewEditControls(DocumentStatus.PENDING_REVIEW, 'scripture'), {
    canEdit: true,
    showEditButton: false,
  });
  assert.deepEqual(reviewEditControls(DocumentStatus.PENDING_REVIEW, 'none'), { canEdit: false, showEditButton: false });
  for (const status of [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED]) {
    assert.deepEqual(reviewEditControls(status, 'direct'), { canEdit: false, showEditButton: false }, status);
  }
});

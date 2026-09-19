import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus, SourceProjectStatus } from '@/generated/prisma/enums';
import { rollUpLanguageProgress, type LanguageDocumentRow } from './language-progress';

const EXODUS = { projectId: 'p1', projectName: 'Exodus90 2026', projectStatus: SourceProjectStatus.ACTIVE };
const ADVENT = { projectId: 'p2', projectName: 'Advent 2025', projectStatus: SourceProjectStatus.ACTIVE };
const SUMMER = { projectId: 'p3', projectName: 'Summer Retreat 2025', projectStatus: SourceProjectStatus.COMPLETE };

const doc = (project: Omit<LanguageDocumentRow, 'status'>, status: DocumentStatus | null): LanguageDocumentRow => ({
  ...project,
  status,
});

describe('rollUpLanguageProgress', () => {
  it('counts deployed over every document in the active projects', () => {
    const progress = rollUpLanguageProgress([
      doc(EXODUS, DocumentStatus.DEPLOYED),
      doc(EXODUS, DocumentStatus.IN_PROGRESS),
      doc(ADVENT, DocumentStatus.DEPLOYED),
      doc(ADVENT, DocumentStatus.PENDING_TRANSLATION),
    ]);

    assert.equal(progress.deployed, 2);
    assert.equal(progress.documents, 4);
    assert.equal(progress.percent, 50);
  });

  it('counts a document with no version as pending rather than dropping it', () => {
    // Counting versions instead would make this language read 100%: one
    // document deployed, one document invisible.
    const progress = rollUpLanguageProgress([doc(EXODUS, DocumentStatus.DEPLOYED), doc(EXODUS, null)]);

    assert.equal(progress.documents, 2);
    assert.equal(progress.percent, 50);
    assert.equal(progress.byStatus[DocumentStatus.PENDING_TRANSLATION], 1);
  });

  it('reports how many documents have no version at all', () => {
    const progress = rollUpLanguageProgress([doc(EXODUS, null), doc(EXODUS, null), doc(ADVENT, DocumentStatus.APPROVED)]);

    assert.equal(progress.missingVersions, 2);
  });

  it('says nothing is missing when every document has a version', () => {
    const progress = rollUpLanguageProgress([doc(EXODUS, DocumentStatus.IN_PROGRESS)]);

    assert.equal(progress.missingVersions, 0);
  });

  it('keeps completed projects out of the headline', () => {
    const progress = rollUpLanguageProgress([
      doc(EXODUS, DocumentStatus.PENDING_TRANSLATION),
      doc(SUMMER, DocumentStatus.DEPLOYED),
      doc(SUMMER, DocumentStatus.DEPLOYED),
    ]);

    assert.equal(progress.documents, 1);
    assert.equal(progress.deployed, 0);
    assert.equal(progress.percent, 0);
  });

  it('counts a completed project in the lifetime totals rather than listing it', () => {
    // A list of finished projects only grows; the work still has to be counted.
    const progress = rollUpLanguageProgress([
      doc(EXODUS, DocumentStatus.DEPLOYED),
      doc(SUMMER, DocumentStatus.DEPLOYED),
      doc(SUMMER, DocumentStatus.APPROVED),
    ]);

    assert.deepEqual(progress.lifetime, {
      projects: 2,
      completedProjects: 1,
      documents: 3,
      translated: 3,
      translatedPercent: 100,
      deployed: 2,
    });
    assert.deepEqual(
      progress.projects.map((p) => p.name),
      ['Exodus90 2026'],
    );
  });

  it('counts approved and deployed as translated, and nothing earlier', () => {
    const progress = rollUpLanguageProgress([
      doc(EXODUS, DocumentStatus.DEPLOYED),
      doc(EXODUS, DocumentStatus.APPROVED),
      doc(EXODUS, DocumentStatus.PENDING_REVIEW),
      doc(EXODUS, null),
    ]);

    assert.equal(progress.lifetime.translated, 2);
    assert.equal(progress.lifetime.translatedPercent, 50);
    assert.equal(progress.lifetime.deployed, 1);
  });

  it('leaves a completed project out of the status breakdown too', () => {
    const progress = rollUpLanguageProgress([doc(SUMMER, DocumentStatus.DEPLOYED), doc(EXODUS, DocumentStatus.APPROVED)]);

    assert.equal(progress.byStatus[DocumentStatus.DEPLOYED], 0);
    assert.equal(progress.byStatus[DocumentStatus.APPROVED], 1);
  });

  it('breaks the work down per project, sorted by name', () => {
    const progress = rollUpLanguageProgress([
      doc(EXODUS, DocumentStatus.DEPLOYED),
      doc(EXODUS, DocumentStatus.DEPLOYED),
      doc(EXODUS, DocumentStatus.PENDING_REVIEW),
      doc(ADVENT, DocumentStatus.IN_PROGRESS),
    ]);

    assert.deepEqual(progress.projects, [
      { id: 'p2', name: 'Advent 2025', documents: 1, deployed: 0, percent: 0 },
      { id: 'p1', name: 'Exodus90 2026', documents: 3, deployed: 2, percent: 67 },
    ]);
  });

  it('counts every status across the active projects', () => {
    const progress = rollUpLanguageProgress([
      doc(EXODUS, DocumentStatus.PENDING_TRANSLATION),
      doc(EXODUS, DocumentStatus.IN_PROGRESS),
      doc(ADVENT, DocumentStatus.PENDING_REVIEW),
      doc(ADVENT, DocumentStatus.APPROVED),
      doc(ADVENT, DocumentStatus.DEPLOYED),
    ]);

    assert.deepEqual(progress.byStatus, {
      PENDING_TRANSLATION: 1,
      IN_PROGRESS: 1,
      PENDING_REVIEW: 1,
      APPROVED: 1,
      DEPLOYED: 1,
    });
  });

  it('reports zero rather than dividing by nothing for a language with no work', () => {
    const progress = rollUpLanguageProgress([]);

    assert.deepEqual(
      { percent: progress.percent, documents: progress.documents, projects: progress.projects },
      { percent: 0, documents: 0, projects: [] },
    );
  });

  it('agrees with the project statistics tab for a single project', () => {
    // ProjectStatisticsTab: deployed ÷ documents in the project, a document
    // with no version counted as pending. Eight of twenty-one is 38%.
    const rows = [
      ...Array.from({ length: 8 }, () => doc(EXODUS, DocumentStatus.DEPLOYED)),
      ...Array.from({ length: 9 }, () => doc(EXODUS, DocumentStatus.IN_PROGRESS)),
      ...Array.from({ length: 4 }, () => doc(EXODUS, null)),
    ];

    const progress = rollUpLanguageProgress(rows);

    assert.equal(progress.documents, 21);
    assert.equal(progress.percent, 38);
  });
});

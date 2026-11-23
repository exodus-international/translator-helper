import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import { Role, TranslationWorkflow } from '@/generated/prisma/enums';
import type { Language } from '@/generated/prisma/client';
import ProjectKanbanBoard, { type ProjectKanbanBoardLoaders } from './project-kanban-board';

/**
 * The board of a source project nobody has added documents to yet. It is the
 * first thing an administrator sees after creating a project, so it has to
 * render an empty state rather than a set of empty columns.
 */

afterEach(cleanup);

const admin = { id: 'user-admin', email: 'admin@example.com', name: 'Admin', role: Role.ADMIN };

const croatian: Language = {
  id: 'lang-hr',
  code: 'hr',
  name: 'Croatian',
  translationInstructions: null,
  branchName: null,
  isSource: false,
  workflow: TranslationWorkflow.MANUAL,
  audioProvider: null,
  audioVoice: null,
  audioRate: null,
  audioPitch: null,
  audioSentencePauseMs: null,
  audioCommaPauseMs: null,
  audioQuality: null,
  audioPreviewText: null,
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
};

const emptyProject: ProjectKanbanBoardLoaders = {
  documents: async () => [],
  members: async () => [],
  changeStatus: async () => {
    throw new Error('nothing to move on an empty board');
  },
};

test('a project with no documents shows an empty board with no filter to clear', async () => {
  render(
    <ProjectKanbanBoard
      user={admin}
      languages={[croatian]}
      deployableLanguageIds={[croatian.id]}
      selectedLanguage={croatian.id}
      sourceProjectId="sp-autumn"
      translationProjectId="tp-hr"
      loaders={emptyProject}
    />,
  );

  assert.ok(await screen.findByText('No documents found'));
  assert.equal(screen.queryByRole('button', { name: 'Clear type filter' }), null);
});

test('an AI-workflow card shows its step and offers no translator to assign', async () => {
  // The columns' scroll areas ask for running animations, which happy-dom lacks.
  Element.prototype.getAnimations ??= () => [];

  const aiDocument = {
    id: 'doc-ai',
    slug: 'gods-rescue-mission',
    title: "God's Rescue Mission",
    type: 'DAY',
    labels: [],
    deadline: null,
    sourceProject: { id: 'sp-autumn', slug: 'advent2025', name: 'Advent 2025' },
    versions: [
      {
        id: 'v-ai',
        status: 'PENDING_REVIEW',
        workflow: TranslationWorkflow.AI,
        aiError: null,
        language: croatian,
        user: { id: 'ai', name: 'AI Translator', email: 'ai@example.invalid', image: null },
        reviewer: null,
        activityLogs: [],
        openSuggestionsCount: 0,
        _count: { approvals: 1 },
      },
    ],
  };

  render(
    <ProjectKanbanBoard
      user={admin}
      languages={[croatian]}
      deployableLanguageIds={[croatian.id]}
      selectedLanguage={croatian.id}
      sourceProjectId="sp-autumn"
      translationProjectId="tp-hr"
      loaders={{ ...emptyProject, documents: async () => [aiDocument] as never }}
    />,
  );

  assert.ok(await screen.findByText('1/2 approvals'));
  assert.equal(screen.queryByTitle('Reassign translator'), null);
  assert.equal(screen.queryByTitle('Assign translator'), null);
});

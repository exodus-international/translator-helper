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

  assert.ok(await screen.findByText('Team: 1/2 approvals'));
  assert.equal(screen.queryByTitle('Reassign translator'), null);
  assert.equal(screen.queryByTitle('Assign translator'), null);
  // Croatian is a manual language here, so its board keeps the manual columns.
  assert.ok(screen.getByText('In Progress'));
  assert.equal(screen.queryByText('AI Translating'), null);
});

test('a language in the AI workflow starts its board at In Review', async () => {
  Element.prototype.getAnimations ??= () => [];
  const czech = { ...croatian, id: 'lang-cs', code: 'cs', name: 'Czech', workflow: TranslationWorkflow.AI };
  const document = (id: string, title: string, versions: unknown[]) => ({
    id,
    slug: id,
    title,
    type: 'DAY',
    labels: [],
    deadline: null,
    sourceProject: { id: 'sp-autumn', slug: 'advent2025', name: 'Advent 2025' },
    versions,
  });
  const drafting = document('doc-drafting', 'Day 1', [
    {
      id: 'v-drafting',
      status: 'AI_TRANSLATING',
      workflow: TranslationWorkflow.AI,
      aiError: null,
      language: czech,
      user: null,
      reviewer: null,
      activityLogs: [],
      openSuggestionsCount: 0,
      _count: { approvals: 0 },
    },
  ]);

  const board = (documents: unknown[]) => (
    <ProjectKanbanBoard
      user={admin}
      languages={[czech]}
      deployableLanguageIds={[czech.id]}
      selectedLanguage={czech.id}
      sourceProjectId="sp-autumn"
      translationProjectId="tp-cs"
      loaders={{ ...emptyProject, documents: async () => documents as never }}
    />
  );

  const first = render(board([drafting]));
  // The draft the AI is still writing shows where it will land, tagged as the AI's.
  assert.ok(await screen.findByText('AI: Drafting'));
  assert.ok(screen.getByText('Audio Review'));
  assert.equal(screen.queryByText('Not Started'), null);
  assert.equal(screen.queryByText('In Progress'), null);
  assert.equal(screen.queryByText('AI Translating'), null);
  first.unmount();

  // A document nobody handed to the AI must not vanish with its column.
  render(board([drafting, document('doc-waiting', 'Day 2', [])]));
  assert.ok(await screen.findByText('Not Started'));
  assert.ok(screen.getByText('Day 2'));
});

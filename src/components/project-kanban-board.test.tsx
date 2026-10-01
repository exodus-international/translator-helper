import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import { Role } from '@/generated/prisma/enums';
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
  audioProvider: null,
  audioVoice: null,
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

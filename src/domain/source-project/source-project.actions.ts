'use server';

import { authorize } from '@/lib/authorize';
import { Role } from '@/generated/prisma/enums';
import { canManageSourceProject } from '@/lib/permissions';
import { listTargetLanguages } from '../language/language.repository';
import { createTranslationProject } from '../translation-project/translation-project.repository';
import { createSourceProjectSchema, updateSourceProjectSchema } from './source-project.types';
import {
  countSourceProjects,
  listSourceProjects,
  listSourceProjectsPaginated,
  getSourceProjectById,
  getSourceProjectByIdentifier,
  getSourceProjectsForUser,
  createSourceProject,
  updateSourceProject,
  deleteSourceProject,
  type SourceProjectSort,
} from './source-project.repository';

export async function listSourceProjectsAction(options?: { includeComplete?: boolean }) {
  await authorize('authenticated');
  return await listSourceProjects(options);
}

/**
 * Server-side pagination, search, and sorting for the admin projects list
 * (issue #51). Returns the page plus the total for the range line.
 *
 * The count and the page are two independent queries, so a concurrent
 * insert can make the total disagree with the page by one row. Fine at
 * this scale; the pagination range clamps defensively regardless.
 */
export async function listSourceProjectsPaginatedAction(filters: {
  search?: string;
  includeComplete?: boolean;
  sort?: SourceProjectSort;
  order?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}) {
  await authorize('authenticated');
  const [sourceProjects, total] = await Promise.all([
    listSourceProjectsPaginated(filters),
    countSourceProjects(filters),
  ]);
  return { sourceProjects, total };
}

export async function getSourceProjectsForUserAction() {
  const { user } = await authorize('authenticated');
  const isAdminUser = user.role === Role.ADMIN;
  return await getSourceProjectsForUser(user.id, isAdminUser);
}

export async function getSourceProjectAction(id: string) {
  await authorize('authenticated');
  return await getSourceProjectById(id);
}

export async function getSourceProjectByIdentifierAction(identifier: string) {
  await authorize('authenticated');
  return await getSourceProjectByIdentifier(identifier);
}

export async function createSourceProjectAction(input: unknown) {
  await authorize('authenticated');

  const validated = createSourceProjectSchema.parse(input);
  const sourceProject = await createSourceProject({
    name: validated.name,
    description: validated.description,
    identifier: validated.identifier,
    acronym: validated.acronym,
  });

  // Auto-create translation projects for all target languages (excluding English)
  const targetLanguages = await listTargetLanguages();

  for (const language of targetLanguages) {
    await createTranslationProject({
      name: `${sourceProject.name} - ${language.name}`,
      sourceProjectId: sourceProject.id,
      languageId: language.id,
    });
  }

  return sourceProject;
}

export async function updateSourceProjectAction(id: string, input: unknown) {
  const { user } = await authorize('authenticated');

  const validated = updateSourceProjectSchema.parse(input);

  // Check permissions: admins can update anything, project managers can only update status
  if (user.role !== Role.ADMIN) {
    // If not an admin, check if user is a project manager for this source project
    const canManage = await canManageSourceProject(user, id);
    if (!canManage) {
      throw new Error('Forbidden: Only deployers and project managers can manage source projects');
    }

    // Project managers can only update status, not name, description or audio settings
    if (
      validated.name !== undefined ||
      validated.description !== undefined ||
      validated.audioDocumentTypes !== undefined ||
      validated.acronym !== undefined
    ) {
      throw new Error('Forbidden: Project managers can only update project status');
    }
  }

  return await updateSourceProject(id, {
    name: validated.name,
    description: validated.description,
    identifier: validated.identifier,
    acronym: validated.acronym,
    status: validated.status,
    audioDocumentTypes: validated.audioDocumentTypes,
  });
}

export async function deleteSourceProjectAction(id: string) {
  await authorize('can:manage-folders');
  return await deleteSourceProject(id);
}

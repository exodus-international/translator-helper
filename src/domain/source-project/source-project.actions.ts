'use server';

import { authorize } from '@/lib/authorize';
import { Role } from '@prisma/client';
import { canManageSourceProject } from '@/lib/permissions';
import { listTargetLanguages } from '../language/language.repository';
import { createTranslationProject } from '../translation-project/translation-project.repository';
import { createSourceProjectSchema, updateSourceProjectSchema } from './source-project.types';
import {
  listSourceProjects,
  getSourceProjectById,
  getSourceProjectsForUser,
  createSourceProject,
  updateSourceProject,
  deleteSourceProject,
} from './source-project.repository';

export async function listSourceProjectsAction(options?: { includeComplete?: boolean }) {
  await authorize('authenticated');
  return await listSourceProjects(options);
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

export async function createSourceProjectAction(input: unknown) {
  await authorize('authenticated');

  const validated = createSourceProjectSchema.parse(input);
  const sourceProject = await createSourceProject({
    name: validated.name,
    description: validated.description,
    identifier: validated.identifier,
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

    // Project managers can only update status, not name or description
    if (validated.name !== undefined || validated.description !== undefined) {
      throw new Error('Forbidden: Project managers can only update project status');
    }
  }

  return await updateSourceProject(id, {
    name: validated.name,
    description: validated.description,
    identifier: validated.identifier,
    status: validated.status,
  });
}

export async function deleteSourceProjectAction(id: string) {
  await authorize('can:manage-folders');
  return await deleteSourceProject(id);
}

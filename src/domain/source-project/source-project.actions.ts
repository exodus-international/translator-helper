'use server';

import { requireUser } from '@/lib/session';
import { canManageFolders, canManageSourceProject } from '@/lib/permissions';
import { listTargetLanguages } from '../language/language.repository';
import { createTranslationProject } from '../translation-project/translation-project.repository';
import { createSourceProjectSchema, updateSourceProjectSchema } from './source-project.types';
import {
  listSourceProjects,
  getSourceProjectById,
  createSourceProject,
  updateSourceProject,
  deleteSourceProject,
} from './source-project.repository';

export async function listSourceProjectsAction(options?: { includeComplete?: boolean }) {
  await requireUser();
  return await listSourceProjects(options);
}

export async function getSourceProjectAction(id: string) {
  await requireUser();
  return await getSourceProjectById(id);
}

export async function createSourceProjectAction(input: unknown) {
  await requireUser(); // Any authenticated user can create projects

  const validated = createSourceProjectSchema.parse(input);
  const sourceProject = await createSourceProject({
    name: validated.name,
    description: validated.description,
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
  const user = await requireUser();

  const validated = updateSourceProjectSchema.parse(input);

  // Check permissions: deployers can update anything, project managers can only update status
  if (!canManageFolders(user)) {
    // If not a deployer, check if user is a project manager for this source project
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
    status: validated.status,
  });
}

export async function deleteSourceProjectAction(id: string) {
  const user = await requireUser();

  if (!canManageFolders(user)) {
    throw new Error('Forbidden: Only deployers can manage source projects');
  }

  return await deleteSourceProject(id);
}

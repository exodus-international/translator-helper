'use server';

import { getUserById } from '@/domain/user/user.repository';
import { authorize } from '@/lib/authorize';
import {
  createProjectMember,
  deleteProjectMember,
  deleteProjectMembersByUser,
  getProjectMemberById,
  getProjectMembersByUserAndProject,
  getProjectReviewers,
  getUserRoleInProject,
  listProjectMembers,
  updateProjectMember,
} from './project-member.repository';
import { createProjectMemberSchema, updateProjectMemberSchema } from './project-member.types';

export async function listProjectMembersAction(translationProjectId: string) {
  await authorize('authenticated');
  return await listProjectMembers(translationProjectId);
}

export async function getProjectMemberAction(id: string) {
  await authorize('authenticated');
  return await getProjectMemberById(id);
}

export async function getProjectMembersByUserAndProjectAction(translationProjectId: string) {
  const { user } = await authorize('authenticated');
  return await getProjectMembersByUserAndProject(user.id, translationProjectId);
}

export async function createProjectMemberAction(input: unknown) {
  const validated = createProjectMemberSchema.parse(input);

  await authorize({ project: validated.translationProjectId, role: 'manager' });

  // Check if user exists in database
  const targetUser = await getUserById(validated.userId);
  if (!targetUser) {
    throw new Error('User not found in database');
  }

  return await createProjectMember({
    translationProjectId: validated.translationProjectId,
    userId: validated.userId,
    role: validated.role,
  });
}

export async function updateProjectMemberAction(id: string, input: unknown) {
  const member = await getProjectMemberById(id);
  if (!member) {
    throw new Error('Project member not found');
  }

  await authorize({ project: member.translationProjectId, role: 'manager' });

  const validated = updateProjectMemberSchema.parse(input);
  return await updateProjectMember(id, {
    role: validated.role,
  });
}

export async function deleteProjectMemberAction(id: string) {
  const member = await getProjectMemberById(id);
  if (!member) {
    throw new Error('Project member not found');
  }

  await authorize({ project: member.translationProjectId, role: 'manager' });

  return await deleteProjectMember(id);
}

export async function deleteProjectMembersByUserAction(userId: string, translationProjectId: string) {
  await authorize({ project: translationProjectId, role: 'manager' });

  return await deleteProjectMembersByUser(userId, translationProjectId);
}

export async function getProjectReviewersAction(translationProjectId: string) {
  await authorize('authenticated');
  const members = await getProjectReviewers(translationProjectId);
  // Deduplicate by user ID (a user might have multiple reviewer-eligible roles)
  const seen = new Set<string>();
  return members.filter((m) => {
    if (seen.has(m.user.id)) return false;
    seen.add(m.user.id);
    return true;
  });
}

export async function getUserRoleInProjectAction(translationProjectId: string) {
  const { user } = await authorize('authenticated');
  return await getUserRoleInProject(user.id, translationProjectId);
}

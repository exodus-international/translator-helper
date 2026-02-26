'use server';

import { getUserById } from '@/domain/user/user.repository';
import { requireUser } from '@/lib/session';
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
  await requireUser();
  return await listProjectMembers(translationProjectId);
}

export async function getProjectMemberAction(id: string) {
  await requireUser();
  return await getProjectMemberById(id);
}

export async function getProjectMembersByUserAndProjectAction(translationProjectId: string) {
  const user = await requireUser();
  return await getProjectMembersByUserAndProject(user.id, translationProjectId);
}

export async function createProjectMemberAction(input: unknown) {
  const user = await requireUser();
  // TODO: Add permission check - only PROJECT_MANAGER or DEPLOYER can add members
  // This will be implemented after permissions system is updated

  const validated = createProjectMemberSchema.parse(input);

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
  const user = await requireUser();
  // TODO: Add permission check - only PROJECT_MANAGER or DEPLOYER can update members

  const validated = updateProjectMemberSchema.parse(input);
  return await updateProjectMember(id, {
    role: validated.role,
  });
}

export async function deleteProjectMemberAction(id: string) {
  const user = await requireUser();
  // TODO: Add permission check - only PROJECT_MANAGER or DEPLOYER can remove members

  return await deleteProjectMember(id);
}

export async function deleteProjectMembersByUserAction(userId: string, translationProjectId: string) {
  const user = await requireUser();
  // TODO: Add permission check - only PROJECT_MANAGER or DEPLOYER can remove members

  return await deleteProjectMembersByUser(userId, translationProjectId);
}

export async function getProjectReviewersAction(translationProjectId: string) {
  await requireUser();
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
  const user = await requireUser();
  return await getUserRoleInProject(user.id, translationProjectId);
}

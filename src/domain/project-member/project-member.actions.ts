'use server';

import { getUserById } from '@/domain/user/user.repository';
import { authorize } from '@/lib/authorize';
import {
  createProjectMember,
  deleteProjectMember,
  deleteProjectMembersByUser,
  getProjectMemberById,
  getProjectReviewers,
  listProjectMembers,
} from './project-member.repository';
import { createProjectMemberSchema } from './project-member.types';

export async function listProjectMembersAction(translationProjectId: string) {
  await authorize('authenticated');
  return await listProjectMembers(translationProjectId);
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

'use server';

import { authorize } from '@/lib/authorize';
import { updateUserRole, listUsers } from './user.repository';
import { Role } from '@prisma/client';

export async function updateUserRoleAction(userId: string, role: Role) {
  await authorize('admin');

  return await updateUserRole(userId, role);
}

export async function listUsersAction() {
  await authorize('admin');

  return await listUsers();
}

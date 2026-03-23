'use server';

import { requireUser } from '@/lib/session';
import { updateUserSchema } from './user.types';
import { updateUserRole, getUserById, listUsers } from './user.repository';
import { Role } from '@prisma/client';

export async function updateUserRoleAction(userId: string, role: Role) {
  const currentUser = await requireUser();

  // Only deployers can update roles
  if (currentUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only deployers can update user roles');
  }

  return await updateUserRole(userId, role);
}

export async function getUserAction(userId: string) {
  await requireUser();
  return await getUserById(userId);
}

export async function listUsersAction() {
  const currentUser = await requireUser();

  // Only deployers can list all users
  if (currentUser.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only deployers can list users');
  }

  return await listUsers();
}

'use server';

import { authorize } from '@/lib/authorize';
import {
  updateUserRole,
  listUsers,
  getUserProfile,
  updateUserProfile,
  completeOnboarding,
  isUserOnboarded,
} from './user.repository';
import { Role } from '@prisma/client';
import {
  updateUserProfileSchema,
  completeOnboardingSchema,
  adminUpdateUserProfileSchema,
} from './user.types';

export async function updateUserRoleAction(userId: string, role: Role) {
  await authorize('admin');
  return await updateUserRole(userId, role);
}

export async function listUsersAction() {
  await authorize('admin');
  return await listUsers();
}

export async function getUserProfileAction() {
  const { user } = await authorize('authenticated');
  return await getUserProfile(user.id);
}

export async function updateUserProfileAction(input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = updateUserProfileSchema.parse(input);
  return await updateUserProfile(user.id, validated);
}

export async function completeOnboardingAction(input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = completeOnboardingSchema.parse(input);
  return await completeOnboarding(user.id, validated);
}

export async function isUserOnboardedAction() {
  const { user } = await authorize('authenticated');
  return await isUserOnboarded(user.id);
}

export async function adminGetUserProfileAction(userId: string) {
  await authorize('admin');
  return await getUserProfile(userId);
}

export async function adminUpdateUserProfileAction(userId: string, input: unknown) {
  await authorize('admin');
  const validated = adminUpdateUserProfileSchema.parse(input);
  return await updateUserProfile(userId, validated);
}


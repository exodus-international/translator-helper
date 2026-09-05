'use server';

import { authorize } from '@/lib/authorize';
import { isObjectStorageConfigured, putObject } from '@/lib/object-storage';
import { randomUUID } from 'node:crypto';
import {
  updateUserRole,
  listUsers,
  getUserProfile,
  updateUserProfile,
  updateUserImage,
  completeOnboarding,
  isUserOnboarded,
} from './user.repository';
import { avatarRejectionReason, resolveAvatarObjectKey, sniffImageContentType } from './user.avatar';
import { Role } from '@/generated/prisma/enums';
import { updateUserProfileSchema, completeOnboardingSchema, adminUpdateUserProfileSchema } from './user.types';

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

/**
 * Stores an uploaded profile picture and points the user at it. The browser
 * has already cropped and downscaled the image; everything here is a check
 * that the bytes are what they claim to be, because the bucket is public and
 * serves objects with the content type we give it.
 */
export async function uploadAvatarAction(formData: FormData): Promise<string> {
  const { user } = await authorize('authenticated');

  if (!isObjectStorageConfigured()) {
    throw new Error('Image storage is not configured');
  }

  const file = formData.get('avatar');
  if (!(file instanceof File)) {
    throw new Error('No image was uploaded');
  }

  const rejection = avatarRejectionReason({ contentType: file.type, size: file.size });
  if (rejection) {
    throw new Error(rejection);
  }

  const body = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageContentType(body);
  if (!contentType) {
    throw new Error('That file is not a JPEG, PNG or WebP image');
  }

  const { url } = await putObject({
    key: resolveAvatarObjectKey({ userId: user.id, contentType, token: randomUUID() }),
    body,
    contentType,
  });
  await updateUserImage(user.id, url);

  return url;
}

/** Drops the profile picture; the avatar falls back to the person's initials. */
export async function removeAvatarAction(): Promise<void> {
  const { user } = await authorize('authenticated');
  await updateUserImage(user.id, null);
}

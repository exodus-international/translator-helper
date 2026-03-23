'use client';

import { Role } from '@prisma/client';
import { SessionUser } from './session';

/**
 * Client-safe permission checks that don't require Prisma.
 * These functions only check user roles and don't access the database.
 */
export function canDeployClient(user: SessionUser): boolean {
  return user.role === Role.ADMIN;
}

export function isAdminClient(user: SessionUser): boolean {
  return user.role === Role.ADMIN;
}

export function isUserClient(user: SessionUser): boolean {
  return user.role === Role.USER;
}

export function canTranslateClient(user: SessionUser): boolean {
  return user.role === Role.USER || user.role === Role.ADMIN;
}

export function canReviewClient(user: SessionUser): boolean {
  return user.role === Role.USER || user.role === Role.ADMIN;
}

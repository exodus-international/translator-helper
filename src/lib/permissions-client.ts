'use client';

import { Role } from '@prisma/client';
import { SessionUser } from './session';

/**
 * Client-safe permission checks that don't require Prisma.
 * These functions only check user roles and don't access the database.
 */
export function canDeployClient(user: SessionUser): boolean {
  return user.role === Role.DEPLOYER;
}

export function isDeployerClient(user: SessionUser): boolean {
  return user.role === Role.DEPLOYER;
}

export function isTranslatorClient(user: SessionUser): boolean {
  return user.role === Role.TRANSLATOR;
}

export function canTranslateClient(user: SessionUser): boolean {
  return user.role === Role.TRANSLATOR || user.role === Role.DEPLOYER;
}

export function canReviewClient(user: SessionUser): boolean {
  return user.role === Role.TRANSLATOR || user.role === Role.DEPLOYER;
}

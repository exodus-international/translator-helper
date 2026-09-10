import { Role } from '@/generated/prisma/enums';
import { headers } from 'next/headers';
import { cache } from 'react';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  image?: string | null;
}

/**
 * The signed-in user, resolved once per request.
 *
 * A single render asks this question many times over — the root layout, the
 * page, and every server action reached through `authorize()`. React's `cache`
 * memoises it for the lifetime of the request, so the session is resolved once
 * instead of once per call site.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user.role as Role) || Role.USER,
      image: session.user.image,
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}


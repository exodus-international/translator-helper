import { Role } from '@/generated/prisma/enums';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { auth } from './auth';
import { loginPath } from './safe-redirect';

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
      // Renewing here pushed the session's expiry forward in the database
      // while the browser cookie kept the 7-day max-age it got at login: a
      // full page load is not flagged as RSC, so better-auth renewed, and the
      // Set-Cookie it wanted to send was dropped because a server component
      // cannot write cookies. Users were logged out 7 days after signing in,
      // however active. `SessionKeepAlive` renews through the auth route
      // handler instead, which can re-issue the cookie.
      query: { disableRefresh: true },
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
    // Next signals "this route cannot be prerendered" by throwing from
    // headers(), and expects to see that error itself. Swallowing it here is
    // what made every build log a "Dynamic server usage" error per page.
    unstable_rethrow(error);
    console.error('Error getting current user:', error);
    return null;
  }
});

/**
 * The signed-in user, or a redirect to the login page when the session is gone.
 *
 * Throwing here surfaced as an unhandled server error, and the page that made
 * the call (often a background poll) failed without telling anyone. `redirect`
 * makes the browser navigate to the login page instead. A server action sends
 * the `Next-Action` header, and its `Referer` is the page it was called from,
 * so that page becomes `from`. During a page render the referer is the
 * previous page, so it is not used there.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const requestHeaders = await headers();
    const isServerAction = requestHeaders.has('next-action');
    redirect(loginPath(isServerAction ? requestHeaders.get('referer') : null));
  }
  return user;
}


'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import type { SessionUser } from '@/lib/session';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

export function PostHogProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: SessionUser | null;
}) {
  // Initialize the client once on mount. Autocapture and history-based
  // pageviews/pageleaves for the App Router are enabled via `defaults`.
  useEffect(() => {
    // The npm package doesn't attach a global like the snippet does; expose
    // it in dev so `posthog.debug()` etc. work from the browser console.
    if (process.env.NODE_ENV === 'development') {
      (window as typeof window & { posthog?: typeof posthog }).posthog =
        posthog;
    }

    if (!POSTHOG_KEY || posthog.__loaded) return;

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      defaults: '2025-05-24',
      // Automatically capture unhandled errors into PostHog Error Tracking
      // (ties errors to the user's session; complements Sentry).
      capture_exceptions: true,
    });
  }, []);

  // Tie events to the authenticated user; reset on logout so the next
  // anonymous visitor doesn't inherit the previous user's identity.
  useEffect(() => {
    if (!POSTHOG_KEY) return;

    if (user) {
      posthog.identify(user.id, {
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } else if (posthog._isIdentified()) {
      posthog.reset();
    }
  }, [user]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

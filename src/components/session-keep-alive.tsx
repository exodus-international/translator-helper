'use client';

import { useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import {
  parseRefreshTimestamp,
  SESSION_REFRESH_STORAGE_KEY,
  shouldRefreshSession,
} from '@/lib/session-refresh';

// Shared by every mount in this tab. localStorage also shares it across tabs,
// but it can be missing or throw, so this is the fallback.
let lastRefreshInMemory: number | null = null;

function readLastRefresh(): number | null {
  try {
    return parseRefreshTimestamp(window.localStorage.getItem(SESSION_REFRESH_STORAGE_KEY)) ?? lastRefreshInMemory;
  } catch {
    return lastRefreshInMemory;
  }
}

function writeLastRefresh(at: number) {
  lastRefreshInMemory = at;
  try {
    window.localStorage.setItem(SESSION_REFRESH_STORAGE_KEY, String(at));
  } catch {
    // Private mode or blocked storage. The in-memory value still throttles.
  }
}

/**
 * Keeps the session cookie alive while the user is active.
 *
 * Server renders read the session but cannot set cookies, so `getCurrentUser`
 * never renews it there. Renewal happens here instead: the auth route handler
 * can write Set-Cookie, so when better-auth extends the session in the
 * database it also re-issues the session cookie with a fresh max-age. The
 * cookie cache is bypassed because a cached answer skips the renewal check.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (!shouldRefreshSession(readLastRefresh(), now)) return;
      writeLastRefresh(now);
      void authClient.getSession({ query: { disableCookieCache: true } }).catch(() => {
        // Offline or the server is down. The next visible tab tries again.
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return null;
}

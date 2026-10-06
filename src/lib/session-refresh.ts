/**
 * How often an open tab asks the auth route to renew the session cookie.
 *
 * better-auth renews a session at most once a day (`updateAge`), so asking
 * once an hour re-issues the cookie within an hour of it becoming due while
 * costing one database lookup per tab per hour.
 */
export const SESSION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export const SESSION_REFRESH_STORAGE_KEY = 'session-refresh-at';

/**
 * Whether it is time to ask for a session refresh again.
 *
 * `lastRefreshAt` is the time of the previous request in milliseconds, or null
 * when there was none. A timestamp in the future means the clock moved
 * backwards or the stored value is junk, and refreshing is the safe answer.
 */
export function shouldRefreshSession(
  lastRefreshAt: number | null,
  now: number,
  intervalMs: number = SESSION_REFRESH_INTERVAL_MS,
): boolean {
  if (lastRefreshAt === null || !Number.isFinite(lastRefreshAt)) return true;
  if (lastRefreshAt > now) return true;
  return now - lastRefreshAt >= intervalMs;
}

/** Reads a stored timestamp, treating anything unparseable as absent. */
export function parseRefreshTimestamp(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

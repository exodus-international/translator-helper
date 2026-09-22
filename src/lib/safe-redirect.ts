/**
 * Where to go after signing in. Only a path on this site is accepted, so a
 * crafted `?from=https://elsewhere` or `//elsewhere` link cannot send someone
 * off the app with a fresh session.
 */
export function safeRedirectPath(from: string | null | undefined, fallback = '/dashboard'): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return fallback;
  return from;
}

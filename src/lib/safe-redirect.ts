/**
 * Where to go after signing in. Only a path on this site is accepted, so a
 * crafted `?from=https://elsewhere` or `//elsewhere` link cannot send someone
 * off the app with a fresh session.
 */
export function safeRedirectPath(from: string | null | undefined, fallback = '/dashboard'): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return fallback;
  // URL parsers strip tabs and newlines and treat backslashes as slashes, so
  // `/\t/evil.example` would parse as a protocol-relative URL. Refuse them outright.
  for (let i = 0; i < from.length; i++) {
    const code = from.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || from[i] === '\\') return fallback;
  }
  // Confirm the path stays on this site once parsed, against a dummy origin.
  if (new URL(from, 'http://internal.invalid').origin !== 'http://internal.invalid') return fallback;
  return from;
}

/**
 * The login page, carrying the page the visitor was on as `from` so signing in
 * takes them back there. `referer` is the full URL of that page. Only its path
 * and query are kept, and anything unusable gives the bare login page.
 */
export function loginPath(referer: string | null | undefined): string {
  if (!referer) return '/login';
  let from: string;
  try {
    const url = new URL(referer);
    from = url.pathname + url.search;
  } catch {
    return '/login';
  }
  if (from.startsWith('/login')) return '/login';
  return `/login?${new URLSearchParams({ from })}`;
}

/** Cookie where ui/sidebar.tsx persists the shell sidebar's open state. */
export const SIDEBAR_COOKIE_NAME = 'sidebar_state';

/** Cookie for the document editor's nested suggestions sidebar, kept separate
    so it never overwrites the shell's persisted state. */
export const EDITOR_SIDEBAR_COOKIE_NAME = 'editor_sidebar_state';

/**
 * Reads a cookie value written by `SidebarProvider`.
 *
 * `undefined` when the panel has never been toggled in this browser, which is
 * what lets the caller fall back to its own default instead of assuming closed.
 */
export function parseSidebarState(value: string | undefined): boolean | undefined {
  if (value !== 'true' && value !== 'false') return undefined;
  return value === 'true';
}

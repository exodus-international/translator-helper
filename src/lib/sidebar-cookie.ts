/** Cookie where ui/sidebar.tsx persists the shell sidebar's open state. */
export const SIDEBAR_COOKIE_NAME = 'sidebar_state';

/** Cookie for the document editor's nested suggestions sidebar, kept separate
    so it never overwrites the shell's persisted state. */
export const EDITOR_SIDEBAR_COOKIE_NAME = 'editor_sidebar_state';

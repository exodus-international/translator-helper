'use client';

/**
 * Editor chrome, carried over from the `translation-theme` the previous editor
 * defined, so the swap is not also a visual change.
 *
 * Colours come from CSS custom properties rather than literals: the previous
 * editor painted from a JS-registered theme that could not see `.dark`, so it
 * needed an effect to re-register on every toggle. CodeMirror paints from CSS,
 * so referencing the tokens lets light and dark follow the app on their own.
 */

import { EditorView } from '@codemirror/view';

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-scroller': {
    fontFamily: MONO,
    lineHeight: '22px',
    overflow: 'auto',
  },
  '.cm-content': {
    paddingTop: '22px',
    paddingBottom: '22px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--background)',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '4ch',
    padding: '0 8px 0 12px',
  },
  '&.cm-focused .cm-activeLineGutter': {
    color: 'var(--cm-accent)',
    backgroundColor: 'transparent',
  },
  '&.cm-focused .cm-activeLine': {
    backgroundColor: 'var(--cm-active-line)',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--cm-accent)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--cm-selection)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-suggestion-gutter': {
    width: '18px',
    cursor: 'pointer',
  },
  '.cm-suggestion-gutter .cm-gutterElement': {
    textAlign: 'center',
  },
});

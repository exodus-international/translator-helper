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

/** lucide `book-open`, stroked so the mask reads it by alpha. */
const BOOK_OPEN = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
)}`;

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    backgroundColor: 'var(--editor)',
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
    backgroundColor: 'var(--editor)',
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
  /*
   * CodeMirror picks its tooltip chrome from the `darkTheme` facet, which this
   * editor never sets — it paints from CSS tokens and follows `.dark` on its
   * own. So the lint tooltip was still the light one (#f5f5f5) while the text
   * inherited our near-white dark-mode foreground: a white message on a white
   * panel, i.e. no message. Paint it from the popover tokens instead, so the
   * hover explanation is legible in both themes.
   */
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 4px 16px oklch(0 0 0 / 0.16)',
  },
  '.cm-tooltip-arrow:before': {
    borderTopColor: 'var(--border)',
    borderBottomColor: 'var(--border)',
  },
  '.cm-tooltip-arrow:after': {
    borderTopColor: 'var(--popover)',
    borderBottomColor: 'var(--popover)',
  },
  /*
   * The lint message reads as a small card: the text wraps at a comfortable
   * measure instead of stretching across the editor, the repair sits on its own
   * row under it, and the rule id is a footnote. CodeMirror ships this markup
   * (text, action, source) with nothing but `display: block` around it, so the
   * rows are ours to set.
   */
  '.cm-tooltip-lint': {
    maxWidth: '26rem',
    maxHeight: '20rem',
    overflowY: 'auto',
    margin: '0',
    padding: '0',
  },
  '.cm-diagnostic': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '8px 10px 8px 9px',
    borderLeft: '3px solid transparent',
  },
  '.cm-diagnostic + .cm-diagnostic': {
    borderTop: '1px solid var(--border)',
  },
  '.cm-diagnostic-error': {
    borderLeftColor: 'var(--destructive)',
  },
  '.cm-diagnostic-warning': {
    borderLeftColor: 'var(--warning)',
  },
  '.cm-diagnostic-info': {
    borderLeftColor: 'var(--info)',
  },
  '.cm-diagnosticAction': {
    marginLeft: '0',
    padding: '4px 8px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    backgroundColor: 'var(--muted)',
    color: 'var(--foreground)',
    font: 'inherit',
    fontSize: '12px',
    cursor: 'pointer',
  },
  '.cm-diagnosticAction:hover': {
    backgroundColor: 'var(--accent)',
  },
  '.cm-diagnosticSource': {
    fontSize: '10px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  /*
   * The lint card's way into the guide: secondary to the fix, so it reads as a
   * quiet link with an icon rather than a second button. CodeMirror lets an
   * action carry a class but no markup (`markClass`), so the book is a mask of
   * the same lucide glyph the header button uses, painted in currentColor.
   */
  '.cm-guide-action': {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
  },
  '.cm-guide-action:hover': {
    backgroundColor: 'var(--muted)',
    color: 'var(--foreground)',
  },
  '.cm-guide-action::before': {
    content: '""',
    display: 'inline-block',
    width: '12px',
    height: '12px',
    marginRight: '6px',
    verticalAlign: '-1px',
    backgroundColor: 'currentColor',
    mask: `url("${BOOK_OPEN}") center / contain no-repeat`,
    WebkitMask: `url("${BOOK_OPEN}") center / contain no-repeat`,
  },
});

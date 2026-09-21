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

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * What the document's constructs look like — the part of the editor a
 * translator actually reads. CodeMirror's own default style is a light-theme
 * palette with fixed colours, so on this editor's dark surface it read as
 * noise: headings and links were the same weight as prose, an HTML tag (the
 * content library is full of them) was plain text, and the attributes inside
 * one were invisible.
 *
 * Everything here is painted from the app's tokens, so both themes follow
 * `.dark` the same way the editor chrome does. Colours are kept few and
 * deliberate — a document is mostly prose, and the marks on it should say
 * *what kind of thing* a token is at a glance, not decorate it:
 *
 *   foreground, heavier   headings, bold
 *   info                  links and their URLs
 *   syntax-tag            HTML tag names, and the selectors of a stylesheet
 *   syntax-attribute      HTML attributes, CSS properties, YAML keys
 *   syntax-string         strings and attribute values
 *   syntax-constant       numbers, units, colours, CSS keywords, entities
 *   muted-foreground      markers, list bullets, quotes, inline code, and the
 *                         punctuation of markup: `<` `>` `=` `:` `;` `{ }`
 *
 * This is the only style the editor has. CodeMirror's default is registered
 * as a fallback, and a fallback is used only when no other style is -- so
 * anything not named here is painted as plain text, not in some default. The
 * CSS a `style` attribute or block carries arrives with tags of its own
 * (colours, units, keywords, selectors), and it was one undifferentiated run
 * until they were listed.
 */
export const editorHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--foreground)', fontWeight: '700', fontSize: '1.35em' },
  { tag: tags.heading2, color: 'var(--foreground)', fontWeight: '700', fontSize: '1.2em' },
  { tag: tags.heading3, color: 'var(--foreground)', fontWeight: '650', fontSize: '1.08em' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], color: 'var(--foreground)', fontWeight: '650' },
  // A table's header row: a heading of no level. Its pipes and the `---` row
  // under it are markers, like the rest.
  { tag: tags.heading, color: 'var(--foreground)', fontWeight: '650' },
  { tag: tags.strong, color: 'var(--foreground)', fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--info)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--info)' },
  { tag: tags.monospace, color: 'var(--muted-foreground)' },
  { tag: tags.quote, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: [tags.contentSeparator, tags.list], color: 'var(--muted-foreground)' },
  // The markers themselves -- `#`, `**`, `>`, the `-` of a list item. Quiet,
  // but not hidden: a translator is writing them, and needs to see where.
  { tag: tags.processingInstruction, color: 'var(--muted-foreground)', opacity: '0.55' },
  // HTML: the content library embeds it, so tags, attributes and the strings
  // they carry all need to be told apart -- and told apart from the prose
  // around them, which is the part a translator changes. A tag name in the
  // foreground at a heavier weight read as bold text; in its own colour, with
  // the brackets around it quiet, it reads as markup.
  { tag: tags.tagName, color: 'var(--syntax-tag)' },
  { tag: tags.className, color: 'var(--syntax-tag)' },
  { tag: tags.attributeName, color: 'var(--syntax-attribute)' },
  { tag: [tags.attributeValue, tags.string], color: 'var(--syntax-string)' },
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: 'var(--syntax-attribute)' },
  // `#CC0000`, `15px`, `auto`, `&nbsp;` -- the values a stylesheet or an entity
  // spells out, as opposed to the names they are given to.
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.color, tags.unit, tags.character],
    color: 'var(--syntax-constant)',
  },
  {
    tag: [
      tags.angleBracket,
      tags.definitionOperator,
      tags.punctuation,
      tags.separator,
      tags.brace,
      tags.paren,
      tags.squareBracket,
    ],
    color: 'var(--muted-foreground)',
  },
  { tag: [tags.comment, tags.meta], color: 'var(--muted-foreground)', fontStyle: 'italic' },
]);

export const editorHighlighting = syntaxHighlighting(editorHighlightStyle);

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
  /*
   * Frontmatter: the parser sees prose ending in `---`, i.e. a setext heading,
   * so the block arrives at 1.2em bold. These two rules outrank the token
   * classes it got (two classes beat one), so the metadata reads as metadata:
   * a quiet block with its keys picked out.
   */
  '.cm-frontmatter, .cm-frontmatter span': {
    fontSize: '0.875rem',
    fontWeight: '400',
    lineHeight: '20px',
    color: 'var(--muted-foreground)',
  },
  // The key's own contents are wrapped in a token span, so the tint has to
  // reach through it -- the parser still thinks this is prose.
  '.cm-frontmatter .cm-frontmatter-key, .cm-frontmatter .cm-frontmatter-key span': {
    color: 'var(--syntax-attribute)',
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

/**
 * The Markdown the editors read.
 *
 * Its own module so that everything reading the editor's syntax tree -- the
 * formatting toolbar's spans, and their tests -- parses with exactly this
 * configuration, not an approximation of it.
 */

import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import type { Extension } from '@codemirror/state';

/**
 * Markdown carries the rest of the document inside it: the content library
 * embeds `<div class="…">`, `<style>` blocks and inline CSS in most files, and
 * a fenced block is usually YAML or CSS when it is not plain text. Each of
 * those is a language of its own, so the markdown parser is given them to hand
 * their contents to -- otherwise an HTML tag is prose and a stylesheet is not
 * even that.
 *
 * The Markdown itself is GitHub's, because that is what the preview renders
 * (marked with `gfm: true`, see lib/markdown): tables, `~~strikethrough~~`,
 * task lists and bare URLs. Without a base the parser is strict CommonMark,
 * which reads none of them -- a struck word was plain text, a table a run of
 * pipes, and the toolbar could not tell a word inside `~~…~~` was struck.
 *
 * `markdownLanguage` is GFM plus three extensions marked does not have, and
 * they come back off: kept, the editor would mark up text the page shows as
 * written (`^x^` as superscript, `:name:` as an emoji) or, for `~x~`, as a
 * subscript where the page strikes it through.
 */
export const markdownSupport: Extension = markdown({
  base: markdownLanguage,
  extensions: { remove: ['Subscript', 'Superscript', 'Emoji'] },
  htmlTagLanguage: html(),
  codeLanguages: (info) => {
    const name = info.toLowerCase();
    if (name.startsWith('yaml') || name.startsWith('yml')) return yaml().language;
    if (name.startsWith('html')) return html().language;
    if (name.startsWith('xml') || name.startsWith('svg')) return xml().language;
    return null;
  },
});

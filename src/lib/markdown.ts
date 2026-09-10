import { Marked } from 'marked';

// The document preview must render the same HTML the deployed translation app
// produces, so translators see exactly what will ship. That app uses marked
// v15, so this repo pins `marked@15` and parses with its defaults
// (gfm: true, breaks: false). Keep these in step with the deployed app: a
// marked upgrade here without one there reintroduces preview/production drift.
const marked = new Marked({ gfm: true, breaks: false });

/**
 * Markdown → HTML, matching the deployed app's marked config.
 *
 * Pure and DOM-free, so it runs during SSR and under `node:test`. Sanitizing
 * is a separate, browser-only step (see `MarkdownPreview`): marked passes raw
 * HTML through, and the sanitizer (DOMPurify) needs a DOM, so the two are kept
 * apart rather than dragging jsdom into the server bundle.
 */
export function parseMarkdown(content: string): string {
  // `async` defaults to false, so parse returns a string synchronously.
  return marked.parse(content ?? '') as string;
}

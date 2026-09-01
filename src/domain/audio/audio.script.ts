import matter from 'gray-matter';

/**
 * Pure conversion of stored Markdown into a speech script: the prose a
 * narrator would read, split by explicit pause markers.
 *
 * A pause is written in the source as an HTML comment so it never shows in
 * rendered Markdown:
 *
 *   <!-- pause-duration="60s" -->
 *
 * The number is whole seconds. Any other HTML comment is dropped.
 * Elements marked data-read="false" are skipped entirely, content included.
 *
 * Every heading also gets a short pause in front of it, so section
 * boundaries are audible — except at the very start of the document, and
 * except when an explicit pause marker already sits there.
 */

export type SpeechSegment = { kind: 'text'; text: string } | { kind: 'pause'; seconds: number };

export interface SpeechScript {
  segments: SpeechSegment[];
}

/**
 * Invisible formatting characters: zero-width spaces and joiners, word
 * joiners, bidi marks, soft hyphens, the BOM. Pasting from Word, Google Docs
 * or a chat client sprinkles these through the text.
 *
 * They come out before anything else reads the string. A pause marker with a
 * word joiner after the "<!--" looks perfectly correct in the editor but
 * never matches, because JavaScript's \s covers U+2000-U+200A and not
 * U+2060 - so the marker falls through to the any-comment rule and the pause
 * silently disappears. A narrator gains nothing from these either.
 *
 * Line and paragraph separators (U+2028, U+2029) are deliberately absent:
 * those are real breaks, not invisible noise. Spelled as escapes because a
 * class written with the literal characters cannot be read or safely edited.
 */
const INVISIBLE_FORMATTING = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

const PAUSE_MARKER = /<!--\s*pause-duration\s*=\s*["'“”]?(\d+)\s*s?["'“”]?\s*-->/i;
// A pause marker or a heading line; group 1 tells the two apart.
const SEGMENT_BREAK = new RegExp(`${PAUSE_MARKER.source}|^[ \\t]{0,3}#{1,6}[ \\t]`, 'gim');
const ANY_HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HEADING_PAUSE_SECONDS = 1;

export function markdownToSpeechScript(markdown: string): SpeechScript {
  // Invisible characters first, so a pasted marker still matches; then
  // unread elements, so a pause marker inside one does not fire.
  const body = stripUnreadElements(stripFrontmatter(stripInvisibleFormatting(markdown)));
  const segments: SpeechSegment[] = [];

  let buffer = '';
  let lastIndex = 0;
  for (const match of body.matchAll(SEGMENT_BREAK)) {
    buffer += body.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;
    if (match[1] !== undefined) {
      const seconds = Number.parseInt(match[1], 10);
      if (seconds > 0) {
        pushText(segments, buffer);
        buffer = '';
        segments.push({ kind: 'pause', seconds });
      }
    } else {
      // Heading: pause in front of it unless the document is only starting
      // or a pause is already there; the heading text itself stays.
      pushText(segments, buffer);
      buffer = match[0];
      if (segments.at(-1)?.kind === 'text') {
        segments.push({ kind: 'pause', seconds: HEADING_PAUSE_SECONDS });
      }
    }
  }
  pushText(segments, buffer + body.slice(lastIndex));

  return { segments };
}

function pushText(segments: SpeechSegment[], raw: string) {
  const text = markdownToPlainText(raw);
  if (text.length > 0) segments.push({ kind: 'text', text });
}

function stripInvisibleFormatting(text: string): string {
  return text.replace(INVISIBLE_FORMATTING, '');
}

function stripFrontmatter(markdown: string): string {
  try {
    return matter(markdown).content;
  } catch {
    return markdown;
  }
}

const UNREAD_OPEN_TAG = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-read\s*=\s*["'“”]?false["'“”]?[^>]*>/i;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Removes every element marked data-read="false", content and all. */
export function stripUnreadElements(text: string): string {
  let match: RegExpMatchArray | null;
  while ((match = text.match(UNREAD_OPEN_TAG)) !== null) {
    const start = match.index ?? 0;
    const tag = match[1].toLowerCase();
    let end = start + match[0].length;
    if (!VOID_TAGS.has(tag) && !match[0].endsWith('/>')) {
      // Scan for the matching close, counting nested same-name tags.
      const tagPattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
      tagPattern.lastIndex = end;
      let depth = 1;
      end = text.length; // unclosed element: skip to end of input
      let m: RegExpExecArray | null;
      while ((m = tagPattern.exec(text)) !== null) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) {
          end = m.index + m[0].length;
          break;
        }
      }
    }
    // A line break where the element stood, so neighbours do not concatenate.
    text = text.slice(0, start) + '\n' + text.slice(end);
  }
  return text;
}

/**
 * Removes Markdown syntax and keeps the words. Deliberately regex based:
 * the input is a narrow dialect (headings, emphasis, links, quotes, lists,
 * fences) and pulling in a full parser buys little here.
 */
export function markdownToPlainText(markdown: string): string {
  let text = stripUnreadElements(stripInvisibleFormatting(markdown))
    .replace(ANY_HTML_COMMENT, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '') // never read code or CSS aloud
    .replace(/<br\s*\/?>/gi, '\n') // line breaks stay line breaks
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|blockquote|section|article|tr|table)\b[^>]*>/gi, '\n'); // block tags separate text

  // Fenced code: drop the fence lines, keep whatever is inside.
  text = text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n?/gm, '');

  // Line-level markers.
  text = text
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '') // headings
    .replace(/^[ \t]*>[ \t]?/gm, '') // blockquotes (one level per line)
    .replace(/^[ \t]*>[ \t]?/gm, '') // nested blockquotes
    .replace(/^[ \t]*[-*+][ \t]+/gm, '') // bullet lists
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, ''); // horizontal rules

  // Inline syntax.
  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1') // reference links -> link text
    .replace(/(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/g, '$2') // bold
    .replace(/(\*|_)(?=\S)([^*_\n]+?)(?<=\S)\1/g, '$2') // italic
    .replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, '$1') // strikethrough
    .replace(/`([^`\n]+)`/g, '$1') // inline code
    .replace(/<\/?[a-zA-Z][^>]*>/g, ''); // stray inline HTML tags

  // Whitespace: trim lines, collapse runs of blank lines to one.
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

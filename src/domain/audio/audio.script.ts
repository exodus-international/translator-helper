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
 */

export type SpeechSegment = { kind: 'text'; text: string } | { kind: 'pause'; seconds: number };

export interface SpeechScript {
  segments: SpeechSegment[];
}

const PAUSE_MARKER = /<!--\s*pause-duration\s*=\s*["'“”]?(\d+)\s*s?["'“”]?\s*-->/gi;
const ANY_HTML_COMMENT = /<!--[\s\S]*?-->/g;

export function markdownToSpeechScript(markdown: string): SpeechScript {
  // Unread elements go first: a pause marker inside one must not fire.
  const body = stripUnreadElements(stripFrontmatter(markdown));
  const segments: SpeechSegment[] = [];

  let buffer = '';
  let lastIndex = 0;
  for (const match of body.matchAll(PAUSE_MARKER)) {
    buffer += body.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;
    const seconds = Number.parseInt(match[1], 10);
    if (seconds > 0) {
      pushText(segments, buffer);
      buffer = '';
      segments.push({ kind: 'pause', seconds });
    }
  }
  pushText(segments, buffer + body.slice(lastIndex));

  return { segments };
}

function pushText(segments: SpeechSegment[], raw: string) {
  const text = markdownToPlainText(raw);
  if (text.length > 0) segments.push({ kind: 'text', text });
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
  let text = stripUnreadElements(markdown)
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

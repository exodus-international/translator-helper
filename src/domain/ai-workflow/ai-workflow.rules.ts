import yaml from 'js-yaml';
import { lintDocument } from '@/lib/lint';

/**
 * The pure rules of the AI workflow: how many approvals move the text on, how
 * often a failing AI step is retried, where an AI note lands in the text, and
 * what a document must pass before the app deploys it on its own. Nothing
 * here reads the database or the network.
 */

/** The user every AI-written draft, comment and audio text is attributed to. Seeded by migration. */
export const AI_USER_ID = '00000000-0000-4000-8000-00000000a1a1';
export const AI_USER_EMAIL = 'ai-translator@translation-helper.invalid';

/** Thumbs-up from this many different people move the text out of review. */
export const REQUIRED_TEXT_APPROVALS = 2;

/** An AI step that fails this many times waits for someone to press Retry. */
export const MAX_AI_ATTEMPTS = 3;

/** A place in the draft the AI is unsure about, as the model reports it. */
export interface AiNote {
  /** The exact words of the translation the note is about. */
  quote: string;
  /** What the AI is unsure of, for the reviewer. */
  comment: string;
  /** A better wording, when the AI has one. Replaces `quote`. */
  suggestion?: string | null;
}

export interface TranslationWithNotes {
  translation: string;
  notes: AiNote[];
}

/**
 * Reads the model's JSON reply. A reply that is not the expected shape throws,
 * which fails the step and retries it; notes that are malformed one by one are
 * dropped rather than failing a good translation.
 */
export function parseTranslationWithNotes(raw: string): TranslationWithNotes {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The AI reply was not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('The AI reply was not a JSON object');

  const { translation, notes } = parsed as { translation?: unknown; notes?: unknown };
  if (typeof translation !== 'string' || !translation.trim()) {
    throw new Error('The AI reply had no translation');
  }

  const cleanNotes = (Array.isArray(notes) ? notes : []).flatMap((note): AiNote[] => {
    if (!note || typeof note !== 'object') return [];
    const { quote, comment, suggestion } = note as Record<string, unknown>;
    if (typeof quote !== 'string' || typeof comment !== 'string' || !comment.trim()) return [];
    return [
      {
        quote,
        comment: comment.trim(),
        suggestion: typeof suggestion === 'string' && suggestion.trim() ? suggestion : null,
      },
    ];
  });

  return { translation, notes: cleanNotes };
}

export interface TextRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Where `quote` sits in `content`, 1-based like a suggestion's range, or null
 * when it is not there.
 *
 * The model reports a quote instead of a line and column because models count
 * lines badly; finding the words is exact. The first occurrence wins, which is
 * wrong only when the same phrase repeats, and then the reviewer still sees
 * the note on a place that says the same thing.
 *
 * Models copy their own text loosely: straight quotes for the typographic
 * ones the translation uses, or none at all, and one space for a line break.
 * When the exact words are not there, a second pass compares them with quote
 * marks left out and runs of whitespace made one space.
 */
export function locateQuote(content: string, quote: string): TextRange | null {
  if (!quote.trim()) return null;
  const exact = content.indexOf(quote);
  if (exact !== -1) return rangeOf(content, exact, exact + quote.length);

  const haystack = loosen(content);
  const needle = loosen(quote.trim()).text;
  const found = haystack.text.indexOf(needle);
  if (found === -1) return null;
  const start = haystack.offsets[found];
  const end = haystack.offsets[found + needle.length - 1] + 1;
  return rangeOf(content, start, end);
}

const QUOTE_MARKS = /["'„“”‚‘’«»‹›]/;

/** The text without quote marks and with every whitespace run as one space, and where each character came from. */
function loosen(text: string): { text: string; offsets: number[] } {
  let out = '';
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (QUOTE_MARKS.test(char)) continue;
    if (/\s/.test(char)) {
      if (out.endsWith(' ')) continue;
      out += ' ';
    } else {
      out += char;
    }
    offsets.push(i);
  }
  return { text: out, offsets };
}

function rangeOf(content: string, start: number, end: number): TextRange {
  return { ...positionAt(content, start, 'start'), ...positionAt(content, end, 'end') } as TextRange;
}

function positionAt(content: string, offset: number, edge: 'start' | 'end') {
  const before = content.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - before.lastIndexOf('\n');
  return edge === 'start' ? { startLine: line, startColumn: column } : { endLine: line, endColumn: column };
}

/** One reason a document may not be deployed without a person looking at it. */
export interface DeployProblem {
  message: string;
}

/**
 * What the app checks before it deploys an AI-workflow document on its own:
 * a YAML file must parse, a Markdown file's frontmatter must parse, and the
 * content lint must find no errors. The content repository's CI checks again
 * after the pull request opens; this catches what would fail there before
 * anything is committed.
 */
export function deployProblems(input: { content: string; filename: string | null; source?: string }): DeployProblem[] {
  const problems: DeployProblem[] = [];
  const isYaml = /\.ya?ml$/i.test(input.filename ?? '');

  if (!input.content.trim()) {
    return [{ message: 'The document is empty' }];
  }

  if (isYaml) {
    const error = yamlError(input.content);
    if (error) problems.push({ message: `The YAML does not parse: ${error}` });
  } else {
    const frontmatter = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(input.content);
    const error = frontmatter ? yamlError(frontmatter[1]) : null;
    if (error) problems.push({ message: `The frontmatter does not parse: ${error}` });
  }

  for (const diagnostic of lintDocument({ text: input.content, source: input.source, filename: input.filename ?? undefined })) {
    if (diagnostic.severity === 'error') problems.push({ message: diagnostic.message });
  }

  return problems;
}

function yamlError(text: string): string | null {
  try {
    yaml.load(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.split('\n')[0] : String(error);
  }
}

/**
 * Why the AI's audio text cannot be used as it is, or nothing when it can.
 *
 * The AI is asked only to take out what a narrator should not read. Anything
 * that suggests it did more is refused and the step retried: SSML that does
 * not hold together, a different voice, or a pause gone missing. A pause is
 * the one thing an author placed on purpose that the AI could quietly drop.
 */
export function audioTextProblems(input: {
  derived: string;
  prepared: string;
  validate: (ssml: string) => { message: string }[];
  voiceOf: (ssml: string) => string | null;
}): DeployProblem[] {
  const problems: DeployProblem[] = input.validate(input.prepared).map(({ message }) => ({ message }));
  if (input.voiceOf(input.prepared) !== input.voiceOf(input.derived)) {
    problems.push({ message: 'The AI changed the voice of the audio text' });
  }
  const breaks = (ssml: string) => (ssml.match(/<break\b/g) ?? []).length;
  if (breaks(input.prepared) !== breaks(input.derived)) {
    problems.push({ message: 'The AI added or removed pauses in the audio text' });
  }
  return problems;
}

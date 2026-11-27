/**
 * The "Standard translations" section of an AI translation's user prompt. It
 * names only what the document uses: its `{{std:n}}` placeholders, the
 * official text of those inside a sentence, and its terms.
 *
 * It lives apart from standard-translation.service.ts so the instructions page
 * can show the real text, as `src/domain/translation/translation.prompt.ts`
 * does for the system prompt. Nothing here reads the environment or the
 * network, which is what makes it safe to import into a client component.
 */

/** The first line of the section, whatever the document uses. */
export const STANDARD_PROMPT_LEAD =
  'Standard translations: the language team has fixed translations for some texts in this document. Use them as given here, never a translation of your own.';

const PLACEHOLDER_RULE =
  'The placeholders {{std:1}}, {{std:2}}, … stand for those texts. After translation each is replaced with its fixed translation. Keep every placeholder exactly as written, where it appears in the source. Do not translate or write out the text it stands for.';

const HINT_LEAD =
  'Where a placeholder sits inside a sentence, its fixed translation is given so the words around it can fit it:';

const TERM_LEAD = 'Terms, each in its base form:';

const TERM_RULE = 'keep this wording and change its form as the grammar needs';

export interface StandardPromptParts {
  /** Whether the source holds any `{{std:n}}` placeholder. */
  placeholders: boolean;
  /** The official text of each placeholder inside a sentence. */
  hints: Array<{ placeholder: string; text: string }>;
  /** The terms the source uses, each once. */
  terms: Array<{ source: string; target: string }>;
}

/** The section for one document; empty when it uses no standard translation. */
export function buildStandardPrompt({ placeholders, hints, terms }: StandardPromptParts): string {
  if (!placeholders && terms.length === 0) return '';
  const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
  return [
    STANDARD_PROMPT_LEAD,
    ...(placeholders ? [PLACEHOLDER_RULE] : []),
    ...(hints.length > 0 ? [HINT_LEAD, ...hints.map((hint) => `- ${hint.placeholder}: ${oneLine(hint.text)}`)] : []),
    ...(terms.length > 0
      ? [
          TERM_LEAD,
          ...terms.map((term) => `- "${oneLine(term.source)}" → "${oneLine(term.target)}" (base form): ${TERM_RULE}`),
        ]
      : []),
  ].join('\n');
}

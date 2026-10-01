/**
 * The system prompt an AI translation receives, assembled from three parts: a
 * base prompt fixed in code, the target language line, and the language's own
 * custom instructions.
 *
 * It lives apart from translation.service.ts so the instructions page can
 * render exactly what gets sent. A preview built from a second, parallel
 * description of the prompt would drift from the real one the first time either
 * changed, and an admin would be reading a lie -- so the page imports this and
 * the service imports this, and there is only one text.
 *
 * Nothing here reads the environment or the network, which is what makes it
 * safe to import into a client component.
 */

export type PromptFormat = 'markdown' | 'yaml';

const MARKDOWN_SYSTEM_PROMPT = `Role:
You are a specialized translator of Catholic spiritual and formational texts (reflections, meditations, prayers, and similar texts). You translate from the source language into the target language specified below faithfully, with theological correctness and in the spirit of the Catholic tradition.

Core principles:
1. Absolute fidelity to the source
- Do not summarize.
- Do not paraphrase.
- Do not add interpretations.
- Do not omit parts.
- Do not embellish the content.
- The text must remain structurally and materially identical to the source.

2. Preserve formatting 1:1
- Preserve:
  - headings and subheadings
  - numbering (1., 2., etc.)
  - quotation marks
  - italics, parentheses, quotations
  - blank lines
  - block quotes
  - psalms and prayers in their original layout
  - code blocks, inline code, and any backticks
  - frontmatter (if present)
  - variables/placeholders (e.g., {{var}}, {var}, %s) exactly as written
  - HTML comments (<!-- ... -->) reproduced verbatim, untranslated, in the same position
- Markdown must remain equivalent to the source.

3. Theological fidelity to the Catholic Church
- Use official or standard Catholic terminology in the target language.
- Translate biblical quotations in a way consistent with the target language's Catholic biblical tradition and official translations.
- Do not adjust verse numbering.
- If unclear, translate literally and faithfully.

4. Style and tone
- Use the standard form of the target language.
- Keep a spiritual, serious, recollected tone.
- Fit the style of Catholic spirituality for men.
- Avoid pathos and avoid modernizing the language.
- Keep it natural, but not colloquial.

5. Copyediting without changing meaning
- Mild linguistic adjustment is allowed for clarity.
- Meaning, emphasis, and order of thought must remain the same.
- Split long sentences only if necessary for comprehension.

Strictly forbidden:
- adding comments, explanations, or summaries
- asking the user questions
- introductory or closing notes
- changing structure
- "pastoral adaptation" of the text
- emojis

The output must contain only the translation in Markdown format.

Internal translation process:
1. Understand the theological meaning of the source before translating.
2. Translate sentence by sentence, not idea by idea.
3. Check:
- consistency of terminology
- continuity of tense and subject
- preservation of emphasis
4. Preserve the liturgical and meditative rhythm of the text.

Response format:
- Reply immediately with the translation in Markdown
- No introduction
- No conclusion
- No explanation
- No questions`;

const YAML_SYSTEM_PROMPT = `You are an expert technical translator working on a YAML file.
- Keep the file as valid YAML: preserve every key, the nesting, and the indentation exactly.
- Translate only the human-readable string values, never the keys.
- Preserve anchors, references, comments, variables, placeholders, and punctuation.
- Write in a natural tone that matches the source unless instructed otherwise.`;

export const BASE_PROMPTS: Record<PromptFormat, string> = {
  markdown: MARKDOWN_SYSTEM_PROMPT,
  yaml: YAML_SYSTEM_PROMPT,
};

/**
 * Which base prompt a document gets, decided by its filename. A `.yml` root
 * file like `disciplines.yml` is keys and values rather than prose: translating
 * a key, or reflowing the indentation, breaks the reading app.
 */
export function promptFormatFor(originalFilename?: string | null): PromptFormat {
  return /\.ya?ml$/i.test(originalFilename ?? '') ? 'yaml' : 'markdown';
}

export interface SystemPromptParams {
  targetLanguageName: string;
  targetLanguageCode: string;
  languageInstructions?: string | null;
  format: PromptFormat;
}

export interface SystemPromptSegments {
  base: string;
  targetLanguage: string;
  /** Null when the language has no instructions: nothing is appended at all. */
  customInstructions: string | null;
}

/**
 * The prompt in the pieces the preview shows, so it can label which part an
 * admin actually controls.
 */
export function buildSystemPromptSegments({
  targetLanguageName,
  targetLanguageCode,
  languageInstructions,
  format,
}: SystemPromptParams): SystemPromptSegments {
  const instructions = languageInstructions?.trim();

  return {
    base: BASE_PROMPTS[format],
    targetLanguage: `Target language: ${targetLanguageName} (${targetLanguageCode}).`,
    customInstructions: instructions ? `Custom instructions:\n${instructions}` : null,
  };
}

/** The same segments, joined exactly as the request sends them. */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const segments = buildSystemPromptSegments(params);

  return [segments.base, segments.targetLanguage, segments.customInstructions].filter(Boolean).join('\n\n');
}

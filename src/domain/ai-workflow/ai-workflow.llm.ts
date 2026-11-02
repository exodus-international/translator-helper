import {
  buildTranslationMessages,
  requestChatCompletion,
  type TranslateWithChatGPTParams,
} from '../translation/translation.service';
import { parseTranslationWithNotes, type TranslationWithNotes } from './ai-workflow.rules';

/**
 * The two things the AI workflow asks the model for: a draft with notes on
 * what it is unsure of, and the audio text with what a narrator should not
 * read taken out. Both go to the same model the editor's Translate button
 * uses, through the same request.
 */

/**
 * Appended to the translation prompt. The base prompt forbids comments in the
 * output, which is right for the text itself; the notes travel beside it in
 * the JSON, so the translation stays exactly as clean as before.
 */
export const REVIEW_NOTES_INSTRUCTIONS = `Review notes:
Two people will review your translation. Help them focus. Where you are unsure of a term, a theological nuance, an idiom, a name, or a biblical reference, or where the source is ambiguous, add a note.
- "quote" is the exact passage of YOUR TRANSLATION the note is about, copied character for character, short (a few words to one sentence), so it can be found in the text.
- "comment" says what you are unsure of, in English, in one or two sentences.
- "suggestion" is an alternative wording for that passage, or an empty string when you have none.
Add notes only where a reviewer should really look. A translation you are confident in has no notes.

Output format for this request (this replaces "Response format" above):
Reply with one JSON object: {"translation": "<the whole translated document>", "notes": [...]}. The translation field holds exactly what you would otherwise have replied, nothing added.`;

const TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['translation', 'notes'],
  properties: {
    translation: { type: 'string' },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['quote', 'comment', 'suggestion'],
        properties: {
          quote: { type: 'string' },
          comment: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
    },
  },
};

export async function translateWithNotes(params: TranslateWithChatGPTParams): Promise<TranslationWithNotes> {
  const [system, user] = buildTranslationMessages(params);
  const raw = await requestChatCompletion(
    [
      { role: 'system', content: `${system.content}\n\n${REVIEW_NOTES_INSTRUCTIONS}` },
      { role: 'user', content: user.content },
    ],
    { jsonSchema: { name: 'translation_with_notes', schema: TRANSLATION_SCHEMA } },
  );
  return parseTranslationWithNotes(raw);
}

export const AUDIO_TEXT_PROMPT = `You prepare SSML for a text-to-speech narrator. You receive SSML built from a written {language} document. Remove only what a listener should not hear read aloud:
- reference marks, footnote numbers and markers such as [1], *, †
- bare URLs, file names, image captions and alt text that slipped through
- emojis, decorative symbols and separators
- abbreviations a narrator would misread, written out in full words of the same language
- any leftover Markdown or HTML syntax
Rules:
- Do not translate, paraphrase, shorten or reorder anything else. Every other word stays exactly as it is.
- Keep every SSML element and attribute as it is: <speak>, <voice>, <prosody>, <mstts:silence>, and every <break> in its place.
- Reply with one JSON object: {"ssml": "<the whole SSML document>"}.`;

const AUDIO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ssml'],
  properties: { ssml: { type: 'string' } },
};

export async function prepareAudioText(input: { ssml: string; languageName: string }): Promise<string> {
  const raw = await requestChatCompletion(
    [
      { role: 'system', content: AUDIO_TEXT_PROMPT.replace('{language}', input.languageName) },
      { role: 'user', content: input.ssml },
    ],
    { jsonSchema: { name: 'audio_text', schema: AUDIO_SCHEMA } },
  );
  let ssml: unknown;
  try {
    ssml = (JSON.parse(raw) as { ssml?: unknown }).ssml;
  } catch {
    throw new Error('The AI reply was not valid JSON');
  }
  if (typeof ssml !== 'string' || !ssml.trim()) throw new Error('The AI reply had no audio text');
  return ssml;
}

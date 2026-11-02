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
 * The AI workflow's draft goes to two reviewers instead of a translator, and
 * its notes are what points them at the hard places. gpt-4o-mini, the editor
 * button's default, writes almost none and quotes its own text loosely, so the
 * workflow has its own setting with a stronger default.
 */
function workflowModel(): string {
  return process.env.AI_WORKFLOW_MODEL || 'gpt-4.1';
}

/**
 * Appended to the translation prompt. The base prompt forbids comments in the
 * output, which is right for the text itself; the notes travel beside it in
 * the JSON, so the translation stays exactly as clean as before.
 */
const REVIEW_NOTES_INSTRUCTIONS = `Review notes:
Two people will review your translation, and your notes tell them where to look. They decide; you point them at the choices. A translator who leaves no notes is hiding decisions, so treat notes as part of the job.
Add a note wherever you made a choice a fluent native reviewer could make differently:
- a term with more than one accepted rendering (theological terms, church vocabulary, names of God, biblical names and places)
- a biblical quotation or reference: which Bible translation the wording follows, or that you translated it yourself
- an idiom, wordplay, rhyme or cultural reference you adapted rather than translated
- a sentence where the source is ambiguous and you picked one reading
- tone and register: formal or informal address, a word that may sound old-fashioned or too casual
- anything you translated loosely, shortened or restructured
Most documents of a few paragraphs have several such places. Aim for roughly one note per 300 words of source, and more where the text is dense with terms or quotations. Skip places where any competent translator would write the same thing.
Every note names a concrete alternative. Before you write a note, write the other wording first; if you cannot think of one, there is no choice to review, so leave the note out. Never write a note that only says you kept the meaning, the tone or the context: that tells the reviewer nothing.
- "quote" is the exact passage of YOUR TRANSLATION the note is about, copied character for character, as short as possible (usually the word or phrase in question, at most one sentence), so it can be found in the text.
- "suggestion" is the alternative wording, in the target language, written so it can replace the quote as is.
- "comment" says, in English, in one or two sentences, how the two versions differ and why you chose yours, e.g. "Kralice and ČEP render this verse differently; I followed ČEP." or "'Captain' as 'kapitán' sounds military in Czech; 'vůdce' is the usual devotional word."

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
    { jsonSchema: { name: 'translation_with_notes', schema: TRANSLATION_SCHEMA }, model: workflowModel() },
  );
  return parseTranslationWithNotes(raw);
}

const AUDIO_TEXT_PROMPT = `You prepare SSML for a text-to-speech narrator. You receive SSML built from a written {language} document. Remove only what a listener should not hear read aloud:
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
    { jsonSchema: { name: 'audio_text', schema: AUDIO_SCHEMA }, model: workflowModel() },
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

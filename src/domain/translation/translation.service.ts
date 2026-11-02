import { buildSystemPrompt, promptFormatFor } from './translation.prompt';

export interface TranslateWithChatGPTParams {
  documentTitle: string;
  sourceLanguageName: string;
  targetLanguageName: string;
  targetLanguageCode: string;
  sourceContent: string;
  languageInstructions?: string | null;
  currentTranslation?: string;
  originalFilename?: string | null;
  /** What the model is told about the Scripture placeholders in `sourceContent`. */
  scripturePrompt?: string;
}

/**
 * Removes a single Markdown code fence that wraps the ENTIRE content
 * (e.g. the model returning ```yaml\n...\n```). Leaves content untouched when
 * it isn't fully wrapped, so genuine inline code blocks are preserved.
 */
export function stripWrappingCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return match ? match[1] : content;
}

export function buildTranslationMessages({
  documentTitle,
  sourceLanguageName,
  targetLanguageName,
  targetLanguageCode,
  sourceContent,
  languageInstructions,
  currentTranslation,
  originalFilename,
  scripturePrompt,
}: TranslateWithChatGPTParams) {
  const format = promptFormatFor(originalFilename);
  const isYaml = format === 'yaml';

  // The instructions page renders this very prompt, from the same function.
  const systemPrompt = buildSystemPrompt({
    targetLanguageName,
    targetLanguageCode,
    languageInstructions,
    format,
  });

  const userPrompt = [
    `Translate the following document titled "${documentTitle}" from ${sourceLanguageName} to ${targetLanguageName}.`,
    isYaml
      ? 'Return only the raw translated YAML, preserving its structure. Do not wrap it in Markdown code fences (```). Do not add explanations.'
      : 'Return only the translated Markdown. Do not add explanations.',
    currentTranslation ? `Existing translation draft (use as reference if it is helpful):\n${currentTranslation}` : '',
    scripturePrompt ?? '',
    'Source content:',
    sourceContent,
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * The sampling parameters a model accepts.
 *
 * Only the gpt-4 and gpt-3.5 families take `temperature`. Every newer model is
 * a reasoning model that rejects it (gpt-6 answers 400 for any value but the
 * default), so they get `reasoning_effort` instead. Checking for the old
 * families, not the new ones, keeps the next model change from breaking AI
 * Translate. `low` is the smallest effort gpt-6 accepts and is plenty for a
 * translation with a detailed prompt; `CHATGPT_REASONING_EFFORT` overrides it.
 */
export function modelSamplingParams(
  model: string,
  configuredEffort?: string,
): { temperature: number } | { reasoning_effort: ReasoningEffort } {
  if (/^gpt-(4|3\.5)/.test(model)) {
    return { temperature: 0.2 };
  }
  const effort = configuredEffort?.trim().toLowerCase();
  const isKnownEffort = REASONING_EFFORTS.includes(effort as ReasoningEffort);
  return { reasoning_effort: isKnownEffort ? (effort as ReasoningEffort) : 'low' };
}

type ChatMessage = { role: 'system' | 'user'; content: string };

/**
 * One chat-completion request to the configured model, returning the reply's
 * text. With `jsonSchema` the model is held to that shape through structured
 * output, and the reply is the JSON text.
 */
export async function requestChatCompletion(
  messages: ChatMessage[],
  options: { jsonSchema?: { name: string; schema: Record<string, unknown> } } = {},
): Promise<string> {
  const apiKey = process.env.CHATGPT_API;
  const endpoint = process.env.CHATGPT_API_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.CHATGPT_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('CHATGPT_API_KEY is not configured. Please set it in your environment.');
  }

  const body = {
    model,
    messages,
    ...modelSamplingParams(model, process.env.CHATGPT_REASONING_EFFORT),
    ...(options.jsonSchema && {
      response_format: {
        type: 'json_schema',
        json_schema: { name: options.jsonSchema.name, strict: true, schema: options.jsonSchema.schema },
      },
    }),
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ChatGPT API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() || '';
}

export async function translateWithChatGPT(params: TranslateWithChatGPTParams): Promise<string> {
  const rawContent = await requestChatCompletion(buildTranslationMessages(params) as ChatMessage[]);
  // Only YAML output should be unwrapped — a legitimate Markdown doc may itself
  // be a single fenced code block, which stripping would corrupt.
  const translatedContent = promptFormatFor(params.originalFilename) === 'yaml' ? stripWrappingCodeFence(rawContent) : rawContent;

  if (!translatedContent) {
    throw new Error('ChatGPT API returned an empty translation.');
  }

  return translatedContent;
}

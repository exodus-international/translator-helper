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

/** The model every translation goes to, single-document and automatic alike. */
export function translationModel(): string {
  return process.env.CHATGPT_MODEL || 'gpt-4o-mini';
}

/**
 * The model's API answered with an error. Carries the HTTP status and, for a
 * 429 or 503, how long the API asked callers to wait, so a background caller
 * can back off by exactly that much.
 */
export class TranslationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = 'TranslationApiError';
  }
}

/** `Retry-After` as milliseconds: either delay-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export async function translateWithChatGPT(
  params: TranslateWithChatGPTParams,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const apiKey = process.env.CHATGPT_API;
  const endpoint = process.env.CHATGPT_API_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com/v1/chat/completions';
  const model = translationModel();

  if (!apiKey) {
    throw new Error('CHATGPT_API_KEY is not configured. Please set it in your environment.');
  }

  const body = {
    model,
    messages: buildTranslationMessages(params),
    ...(model.includes('gpt-5') ? { reasoning_effort: 'low' as const } : { temperature: 0.2 }),
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new TranslationApiError(
      `ChatGPT API request failed: ${response.status} ${response.statusText} - ${errorBody}`,
      response.status,
      parseRetryAfter(response.headers.get('retry-after')),
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const rawContent = payload.choices?.[0]?.message?.content?.trim() || '';
  // Only YAML output should be unwrapped — a legitimate Markdown doc may itself
  // be a single fenced code block, which stripping would corrupt.
  const translatedContent = promptFormatFor(params.originalFilename) === 'yaml' ? stripWrappingCodeFence(rawContent) : rawContent;

  if (!translatedContent) {
    throw new Error('ChatGPT API returned an empty translation.');
  }

  return translatedContent;
}

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

export async function translateWithChatGPT(params: TranslateWithChatGPTParams): Promise<string> {
  const apiKey = process.env.CHATGPT_API;
  const endpoint = process.env.CHATGPT_API_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.CHATGPT_MODEL || 'gpt-4o-mini';

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
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ChatGPT API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
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

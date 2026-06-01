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

const MARKDOWN_SYSTEM_PROMPT = `You are an expert technical translator.
- Maintain the original Markdown structure, code blocks, and frontmatter.
- Preserve variables, placeholders, and punctuation.
- Write in a natural tone that matches the source unless instructed otherwise.`;

const YAML_SYSTEM_PROMPT = `You are an expert technical translator working on a YAML file.
- Keep the file as valid YAML: preserve every key, the nesting, and the indentation exactly.
- Translate only the human-readable string values, never the keys.
- Preserve anchors, references, comments, variables, placeholders, and punctuation.
- Write in a natural tone that matches the source unless instructed otherwise.`;

function isYamlFilename(originalFilename?: string | null): boolean {
  return /\.ya?ml$/i.test(originalFilename ?? '');
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
  const isYaml = isYamlFilename(originalFilename);

  const systemPrompt = [
    isYaml ? YAML_SYSTEM_PROMPT : MARKDOWN_SYSTEM_PROMPT,
    `Target language: ${targetLanguageName} (${targetLanguageCode}).`,
    languageInstructions ? `Custom instructions:\n${languageInstructions}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: buildTranslationMessages(params),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ChatGPT API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const translatedContent = stripWrappingCodeFence(payload.choices?.[0]?.message?.content?.trim() || '');

  if (!translatedContent) {
    throw new Error('ChatGPT API returned an empty translation.');
  }

  return translatedContent;
}

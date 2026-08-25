import { z } from 'zod';

const azureSpeechConfigSchema = z.object({
  /** Host from the resource's "Keys and Endpoint" page; either `{name}.cognitiveservices.azure.com` or `{region}.api.cognitive.microsoft.com` works. */
  endpoint: z.string({ error: 'AZURE_SPEECH_ENDPOINT must be a URL' }).url('AZURE_SPEECH_ENDPOINT must be a URL'),
  key: z.string({ error: 'AZURE_SPEECH_KEY is required' }).min(1, 'AZURE_SPEECH_KEY is required'),
});

export type AzureSpeechConfig = z.infer<typeof azureSpeechConfigSchema>;

let cachedConfig: AzureSpeechConfig | null = null;

export function getAzureSpeechConfig(): AzureSpeechConfig {
  if (cachedConfig) return cachedConfig;

  const result = azureSpeechConfigSchema.safeParse({
    endpoint: process.env.AZURE_SPEECH_ENDPOINT?.replace(/\/+$/, ''),
    key: process.env.AZURE_SPEECH_KEY,
  });

  if (!result.success) {
    const errors = result.error.issues.map((i) => i.message).join(', ');
    throw new Error(`Azure Speech configuration is incomplete: ${errors}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function isAzureSpeechConfigured(): boolean {
  try {
    getAzureSpeechConfig();
    return true;
  } catch (error: unknown) {
    console.log('[AzureSpeech] Not configured:', error instanceof Error ? error.message : error);
    return false;
  }
}

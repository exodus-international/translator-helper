import { z } from 'zod';

const azureSpeechConfigSchema = z.object({
  resource: z.string({ error: 'AZURE_SPEECH_RESOURCE is required' }).min(1, 'AZURE_SPEECH_RESOURCE is required'),
  key: z.string({ error: 'AZURE_SPEECH_KEY is required' }).min(1, 'AZURE_SPEECH_KEY is required'),
});

export type AzureSpeechConfig = z.infer<typeof azureSpeechConfigSchema>;

let cachedConfig: AzureSpeechConfig | null = null;

export function getAzureSpeechConfig(): AzureSpeechConfig {
  if (cachedConfig) return cachedConfig;

  const result = azureSpeechConfigSchema.safeParse({
    resource: process.env.AZURE_SPEECH_RESOURCE,
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

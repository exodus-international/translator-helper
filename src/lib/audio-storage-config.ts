import { z } from 'zod';

const audioStorageConfigSchema = z.object({
  endpoint: z.string({ error: 'AUDIO_S3_ENDPOINT must be a URL' }).url('AUDIO_S3_ENDPOINT must be a URL'),
  region: z.string({ error: 'AUDIO_S3_REGION is required' }).min(1, 'AUDIO_S3_REGION is required'),
  bucket: z.string({ error: 'AUDIO_S3_BUCKET is required' }).min(1, 'AUDIO_S3_BUCKET is required'),
  accessKeyId: z.string({ error: 'AUDIO_S3_ACCESS_KEY_ID is required' }).min(1, 'AUDIO_S3_ACCESS_KEY_ID is required'),
  secretAccessKey: z.string({ error: 'AUDIO_S3_SECRET_ACCESS_KEY is required' }).min(1, 'AUDIO_S3_SECRET_ACCESS_KEY is required'),
  /** Base URL the bucket is publicly readable from; object keys are appended to it. */
  publicBaseUrl: z.string({ error: 'AUDIO_S3_PUBLIC_BASE_URL must be a URL' }).url('AUDIO_S3_PUBLIC_BASE_URL must be a URL'),
  /** Path-style addressing (`endpoint/bucket/key`) is what MinIO and most self-hosted S3 clones expect. */
  forcePathStyle: z.boolean(),
});

export type AudioStorageConfig = z.infer<typeof audioStorageConfigSchema>;

let cachedConfig: AudioStorageConfig | null = null;

export function getAudioStorageConfig(): AudioStorageConfig {
  if (cachedConfig) return cachedConfig;

  const result = audioStorageConfigSchema.safeParse({
    endpoint: process.env.AUDIO_S3_ENDPOINT,
    region: process.env.AUDIO_S3_REGION ?? 'auto',
    bucket: process.env.AUDIO_S3_BUCKET,
    accessKeyId: process.env.AUDIO_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AUDIO_S3_SECRET_ACCESS_KEY,
    publicBaseUrl: process.env.AUDIO_S3_PUBLIC_BASE_URL,
    forcePathStyle: process.env.AUDIO_S3_FORCE_PATH_STYLE !== 'false',
  });

  if (!result.success) {
    const errors = result.error.issues.map((i) => i.message).join(', ');
    throw new Error(`Audio storage configuration is incomplete: ${errors}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function isAudioStorageConfigured(): boolean {
  try {
    getAudioStorageConfig();
    return true;
  } catch (error: unknown) {
    console.log('[AudioStorage] Not configured:', error instanceof Error ? error.message : error);
    return false;
  }
}

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getAudioStorageConfig } from './audio-storage-config';

/**
 * Thin wrapper over S3-compatible object storage. One operation, because
 * that is all the app needs: write bytes under a key and get back the
 * public URL they are readable from.
 */

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const config = getAudioStorageConfig();
  client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return client;
}

/**
 * Writes `body` under `{AUDIO_S3_KEY_PREFIX}/{key}` and returns the full key
 * and its public URL. Callers pass environment-agnostic keys; the prefix is
 * what keeps staging and production apart in a shared bucket.
 */
export async function putObject(params: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ key: string; url: string }> {
  const config = getAudioStorageConfig();
  const key = `${config.keyPrefix}/${params.key.replace(/^\/+/, '')}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return { key, url: publicUrlFor(key) };
}

export function publicUrlFor(key: string): string {
  const base = getAudioStorageConfig().publicBaseUrl.replace(/\/+$/, '');
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

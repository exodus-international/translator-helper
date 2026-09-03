/**
 * Pure rules for profile pictures, kept out of the action so they can be
 * tested without a database or object storage.
 */

/**
 * The browser downscales a picture to a square before it is sent, so anything
 * arriving here should be well under this. The limit exists to stop a
 * hand-crafted request, not to reject a phone photo.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Formats the browser is asked to produce, in order of preference. */
export const AVATAR_CONTENT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

/** Longest edge of the stored square, in pixels. Enough for a retina profile header. */
export const AVATAR_DIMENSION = 512;

const EXTENSIONS: Record<AvatarContentType, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const AVATAR_PREFIX = 'avatars/';

export interface AvatarUpload {
  contentType: string;
  size: number;
}

/**
 * Returns why an upload must be rejected, or null when it may proceed.
 * Messages are user-facing: they are shown as-is in a toast.
 */
export function avatarRejectionReason({ contentType, size }: AvatarUpload): string | null {
  if (!isAvatarContentType(contentType)) {
    return 'Avatar must be a JPEG, PNG or WebP image';
  }
  if (size <= 0) {
    return 'Avatar file is empty';
  }
  if (size > AVATAR_MAX_BYTES) {
    return `Avatar must be smaller than ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB`;
  }
  return null;
}

export function isAvatarContentType(value: string): value is AvatarContentType {
  return (AVATAR_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Object key for a profile picture. The random token means every upload lands
 * on a new key: objects are stored `immutable`, so overwriting one would leave
 * browsers and CDNs showing the old face for a year. The superseded object is
 * left in the bucket — a few tens of kilobytes per change, against the risk of
 * deleting a picture a stale page is still showing.
 *
 *   avatars/{userId}/{token}.webp
 */
export function resolveAvatarObjectKey(params: {
  userId: string;
  contentType: AvatarContentType;
  token: string;
}): string {
  return `${AVATAR_PREFIX}${params.userId}/${params.token}.${EXTENSIONS[params.contentType]}`;
}

const SIGNATURES: Array<{ contentType: AvatarContentType; matches: (bytes: Uint8Array) => boolean }> = [
  {
    contentType: 'image/png',
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    contentType: 'image/jpeg',
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    // RIFF....WEBP
    contentType: 'image/webp',
    matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
];

/**
 * The format the bytes actually are, regardless of what the upload claimed.
 * The bucket is publicly readable and serves objects with the content type we
 * store, so the stored type has to come from the file, not from the browser.
 */
export function sniffImageContentType(bytes: Uint8Array): AvatarContentType | null {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.contentType ?? null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

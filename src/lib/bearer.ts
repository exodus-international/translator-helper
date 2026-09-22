import crypto from 'node:crypto';

/**
 * Whether a request presents `secret` as its bearer token, compared in constant
 * time. Guards the endpoints a Coolify scheduled task calls.
 */
export function hasBearerSecret(authorization: string | null, secret: string): boolean {
  const presented = Buffer.from(authorization?.replace(/^Bearer\s+/i, '') ?? '');
  const expected = Buffer.from(secret);
  return presented.length === expected.length && crypto.timingSafeEqual(presented, expected);
}

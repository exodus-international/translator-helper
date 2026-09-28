import crypto from 'node:crypto';

/** The `X-Hub-Signature-256` value GitHub sends for `payload`. */
export function signWebhookPayload(payload: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Whether `signature` is GitHub's signature of `payload` under `secret`,
 * compared in constant time.
 *
 * A header of the wrong length is refused rather than thrown on:
 * `timingSafeEqual` insists on equal lengths, and a malformed header is an
 * unauthenticated request, not a server error.
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const presented = Buffer.from(signature);
  const expected = Buffer.from(signWebhookPayload(payload, secret));
  return presented.length === expected.length && crypto.timingSafeEqual(presented, expected);
}

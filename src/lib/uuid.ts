/**
 * Telling a UUID apart from a readable URL segment.
 *
 * Routes that accept both an id and a slug use this to decide which lookup to
 * run. It works because slugs and project identifiers are validated against
 * `[a-z0-9-]` with no UUID-shaped values allowed, so the two sets cannot
 * overlap.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID.test(value);
}

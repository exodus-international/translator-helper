/**
 * Canonical editor URLs.
 *
 *   /documents/{project}/{slug}/{lang}      e.g. /documents/exodus90/day-1/cs
 *
 * Which editor opens — translate or review — follows the version's status, so a
 * link keeps working as a document moves through the workflow rather than
 * pointing at the editor it happened to be in when it was shared.
 *
 * The old shape carried three UUIDs:
 *
 *   /documents/{documentId}/translate?lang={languageId}&version={versionId}
 *
 * `version` was always redundant: DocumentVersion is unique on
 * (documentId, languageId), so document plus language already identifies it.
 *
 * Links in that old shape are still handed out in Slack and email, so they have
 * to keep resolving. `isUuid` is how the routes tell the two apart: a slug
 * cannot look like a UUID, because slugs are validated against [a-z0-9-] and a
 * UUID has a fixed shape.
 */

export interface DocumentRef {
  /** SourceProject.identifier, e.g. "exodus90" */
  projectIdentifier: string | null | undefined;
  /** Document.slug, e.g. "day-1" */
  slug: string;
  /** Language.code, e.g. "cs" */
  languageCode: string;
  /** Only used to build a fallback link when the project has no identifier. */
  documentId: string;
}

/**
 * The canonical path for opening a document in a language.
 *
 * Falls back to the id-based shape when the project has no identifier. That is
 * reachable: Document.sourceProjectId is nullable with onDelete: SetNull, so
 * deleting a project orphans its documents. The legacy route accepts `lang` as
 * either an id or a code and renders the editor in place for such a document,
 * so this path resolves rather than 404s.
 */
export function buildDocumentPath(ref: DocumentRef): string {
  if (!ref.projectIdentifier) {
    return `/documents/${encode(ref.documentId)}/translate?lang=${encode(ref.languageCode)}`;
  }
  return `/documents/${encode(ref.projectIdentifier)}/${encode(ref.slug)}/${encode(ref.languageCode)}`;
}

/** The edit form for a document, which is not language-specific. */
export function buildDocumentEditPath(ref: Pick<DocumentRef, 'projectIdentifier' | 'slug' | 'documentId'>): string {
  if (!ref.projectIdentifier) {
    return `/documents/${encode(ref.documentId)}/edit`;
  }
  return `/documents/${encode(ref.projectIdentifier)}/${encode(ref.slug)}/edit`;
}

/**
 * Segments that can never be a document slug, because a static route already
 * claims them at that position. `createDocumentSchema` rejects them so a
 * document cannot be created that is unreachable by its own URL.
 */
export const RESERVED_SLUGS = ['edit', 'new', 'translate', 'review'] as const;

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug);
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

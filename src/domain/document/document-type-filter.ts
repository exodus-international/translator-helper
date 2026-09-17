import { DocumentType } from '@/generated/prisma/enums';

/**
 * Sentinel for documents that have no `type` set. Without it, selecting any
 * type would hide untyped documents with no way to bring them back.
 */
export const NO_TYPE = 'NO_TYPE';

export type DocumentTypeFilterValue = DocumentType | typeof NO_TYPE;

const VALID_VALUES = new Set<string>([...Object.values(DocumentType), NO_TYPE]);

/**
 * An empty selection means "no filter" — every document passes. Once the user
 * picks at least one value, only documents matching one of them pass.
 */
export function matchesDocumentTypeFilter(
  type: DocumentType | null | undefined,
  selected: readonly DocumentTypeFilterValue[],
): boolean {
  if (selected.length === 0) return true;
  return selected.includes(type ?? NO_TYPE);
}

export function toggleDocumentTypeFilter(
  selected: readonly DocumentTypeFilterValue[],
  value: DocumentTypeFilterValue,
): DocumentTypeFilterValue[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

/**
 * Reads a persisted selection. Anything unparseable or no longer a known type
 * (an enum member removed since the value was written) is dropped, so a stale
 * localStorage entry can never hide every document.
 */
export function parseDocumentTypeFilter(raw: string | null | undefined): DocumentTypeFilterValue[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  return parsed.filter((value): value is DocumentTypeFilterValue => {
    if (typeof value !== 'string' || !VALID_VALUES.has(value) || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function serializeDocumentTypeFilter(selected: readonly DocumentTypeFilterValue[]): string {
  return JSON.stringify(selected);
}

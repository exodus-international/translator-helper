/**
 * Validates a document's original filename against the rules for its type.
 * Returns an error message, or null when the filename is acceptable.
 *
 * - DAILY_CONTENT: required, must match "YYYYMMDD-N.md"
 * - MEETING: required, must be a day range like "1-6.md" or a single "7.md"
 * - ROOT_FILE: required, any extension, but must not contain a path separator
 * - everything else: no constraint
 */
export function validateFilename(documentType: string, originalFilename: string): string | null {
  switch (documentType) {
    case 'DAILY_CONTENT':
      if (!originalFilename) {
        return 'Daily Content documents require a filename (e.g., "20260201-5.md")';
      }
      if (!/^\d{8}-\d+\.md$/.test(originalFilename)) {
        return `Invalid filename "${originalFilename}". Expected format "YYYYMMDD-N.md" (e.g., "20260201-5.md")`;
      }
      return null;

    case 'MEETING':
      if (!originalFilename) {
        return 'Meeting documents require a filename with a day range (e.g., "1-6.md" or "7.md")';
      }
      if (!/^\d+(-\d+)?\.md$/.test(originalFilename)) {
        return `Invalid filename "${originalFilename}". Expected a day range like "1-6.md" or "7.md"`;
      }
      return null;

    case 'ROOT_FILE':
      if (!originalFilename) {
        return 'Root File documents require a filename (e.g., "description.md", "disciplines.yml")';
      }
      if (/[\\/]/.test(originalFilename)) {
        return `Invalid filename "${originalFilename}". Root files cannot contain a path separator`;
      }
      return null;

    default:
      return null;
  }
}

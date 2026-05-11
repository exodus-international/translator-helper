export function validateMeetingFilename(documentType: string, originalFilename: string): string | null {
  if (documentType !== 'MEETING') return null;

  if (!originalFilename) {
    return 'Meeting documents require a filename (e.g., "1-7.md")';
  }

  if (!/^\d+-\d+\.md$/.test(originalFilename)) {
    return `Invalid filename "${originalFilename}". Expected format "N-N.md" (e.g., "1-7.md")`;
  }

  return null;
}

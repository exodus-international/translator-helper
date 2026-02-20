export function validateDailyContentFilename(
  documentType: string,
  originalFilename: string,
): string | null {
  if (documentType !== 'DAILY_CONTENT') return null;

  if (!originalFilename) {
    return 'Daily Content documents require a filename (e.g., "20260201-5.md")';
  }

  if (!/^\d{8}-\d+\.md$/.test(originalFilename)) {
    return `Invalid filename "${originalFilename}". Expected format "YYYYMMDD-N.md" (e.g., "20260201-5.md")`;
  }

  return null;
}

import { DocumentType } from '@prisma/client';
import { FilePathParams } from './github.types';

/**
 * Resolves the repo-relative path a document version is committed to, based on
 * its document type. Pure function — no side effects — so it can be unit tested
 * in isolation across every document type.
 */
export function resolveFilePath(params: FilePathParams): string {
  const { documentType, languageCode, identifier, originalFilename, slug } = params;
  const filename = originalFilename || `${slug}.md`;

  switch (documentType) {
    case DocumentType.DAY:
      return `translations/${languageCode}/exercises/${identifier}/days/${filename}`;

    case DocumentType.FIELD_GUIDE:
      return `translations/${languageCode}/exercises/${identifier}/field_guide/${filename}`;

    case DocumentType.DAILY_CONTENT: {
      const { year, month } = parseDailyContentDate(originalFilename);
      return `translations/${languageCode}/daily_content/${year}/${month}/${filename}`;
    }

    case DocumentType.MEETING:
      return `translations/${languageCode}/exercises/${identifier}/meetings/${filename}`;

    case DocumentType.ROOT_FILE:
      return `translations/${languageCode}/exercises/${identifier}/${filename}`;

    default:
      throw new Error(`Unknown document type: ${documentType}`);
  }
}

function parseDailyContentDate(originalFilename: string | null): { year: string; month: string } {
  if (!originalFilename) {
    throw new Error('DAILY_CONTENT documents require an originalFilename to parse year/month');
  }

  // Expected format: 20260201-5.md → year=2026, month=02
  const match = originalFilename.match(/^(\d{4})(\d{2})/);
  if (!match) {
    throw new Error(
      `Cannot parse year/month from filename "${originalFilename}". Expected format like "20260201-5.md"`,
    );
  }

  return { year: match[1], month: match[2] };
}

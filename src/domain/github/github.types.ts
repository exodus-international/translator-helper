import { DocumentType } from '@/generated/prisma/enums';

export interface FilePathParams {
  documentType: DocumentType;
  languageCode: string;
  /** SourceProject.repositoryDirectory — the folder in the content repository. */
  repositoryDirectory: string;
  originalFilename: string | null;
  slug: string;
}

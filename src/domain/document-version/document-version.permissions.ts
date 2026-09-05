import { authorize } from '@/lib/authorize';
import type { SessionUser } from '@/lib/session';
import { Role } from '@/generated/prisma/enums';
import { getDocumentById } from '../document/document.repository';
import { getLanguageById } from '../language/language.repository';
import { getTranslationProjectBySourceAndLanguage } from '../translation-project/translation-project.repository';
import { getDocumentVersionById } from './document-version.repository';

/**
 * The one rule for "may this user change this document version": source
 * (English) versions are admin-only; translation versions are open to their
 * owner or to a translator of the matching translation project. Editing and
 * regenerating audio share it, so the two never drift apart.
 */
export async function assertCanEditDocumentVersion(versionId: string, user: SessionUser) {
  const version = await getDocumentVersionById(versionId);
  if (!version) throw new Error('Document version not found');

  const language = await getLanguageById(version.languageId);
  if (!language) throw new Error('Language not found');

  const isSourceEnglish = language.code === 'en';
  if (isSourceEnglish) {
    if (user.role !== Role.ADMIN) {
      throw new Error('Forbidden: Only deployers can edit source (English) document versions');
    }
    return { version, language, isSourceEnglish };
  }

  const document = await getDocumentById(version.documentId);
  if (!document) throw new Error('Document not found');
  if (!document.sourceProject?.id) {
    throw new Error(
      'This document is not associated with a source project. Please assign a source project to the document before editing translations.',
    );
  }

  const translationProject = await getTranslationProjectBySourceAndLanguage(document.sourceProject.id, version.languageId);
  if (translationProject && version.userId !== user.id) {
    await authorize({ project: translationProject.id, role: 'translator' });
  }

  return { version, language, isSourceEnglish };
}

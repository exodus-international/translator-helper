import { getDocumentById } from '../document/document.repository';
import { getDocumentVersionById } from './document-version.repository';
import { getTranslationProjectBySourceAndLanguage } from '../translation-project/translation-project.repository';

/**
 * Resolves the full context (version, document, translation project) from a documentVersionId.
 * Used by actions that need to check project-scoped permissions before operating on a version.
 */
export async function resolveTranslationProject(documentVersionId: string) {
  const version = await getDocumentVersionById(documentVersionId);
  if (!version) {
    throw new Error('Document version not found');
  }

  const document = await getDocumentById(version.documentId);
  if (!document || !document.sourceProjectId) {
    throw new Error('Document not found or not associated with a source project');
  }

  const translationProject = await getTranslationProjectBySourceAndLanguage(
    document.sourceProjectId,
    version.languageId,
  );

  return { version, document, translationProject };
}

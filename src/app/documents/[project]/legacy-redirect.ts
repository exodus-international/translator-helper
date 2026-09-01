import { getDocumentVersionById } from '@/domain/document-version/document-version.repository';
import { getDocumentById } from '@/domain/document/document.repository';
import { buildDocumentEditPath, buildDocumentPath, isUuid } from '@/domain/document/document-url';
import { getLanguageByCode, getLanguageById } from '@/domain/language/language.repository';
import { notFound, redirect } from 'next/navigation';

/**
 * The old URLs are still in Slack threads and mail, so they keep working:
 *
 *   /documents/{documentId}/translate?lang={languageId}&version={versionId}
 *   /documents/{documentId}/review?version={versionId}
 *   /documents/{documentId}/edit
 *
 * A 307 rather than a permanent redirect on purpose: the target is built from
 * the project identifier and the document slug, and an admin can change the
 * identifier. A 308 would be cached by the browser indefinitely and keep
 * sending people to a path that no longer exists.
 */
export async function resolveLegacy(
  documentId: string,
  opts: { lang?: string; versionId?: string } = {},
): Promise<{ document: DocumentRecord; language: LanguageRecord } | never> {
  // The segment is a document id only if it looks like one. A project
  // identifier here means someone reached a legacy path that is not one.
  if (!isUuid(documentId)) {
    notFound();
  }

  const document = await getDocumentById(documentId);

  if (!document) {
    notFound();
  }

  const language = await resolveLanguage(opts);

  if (!language) {
    notFound();
  }

  // A document whose project was deleted has no canonical URL. Hand it back so
  // the caller can render the editor in place rather than redirect nowhere.
  if (document.sourceProject?.identifier) {
    redirect(
      buildDocumentPath({
        projectIdentifier: document.sourceProject.identifier,
        slug: document.slug,
        languageCode: language.code,
        documentId: document.id,
      }),
    );
  }

  return { document, language };
}

export async function redirectToLegacyEdit(documentId: string): Promise<void> {
  if (!isUuid(documentId)) {
    notFound();
  }

  const document = await getDocumentById(documentId);

  if (!document) {
    notFound();
  }

  if (!document.sourceProject?.identifier) {
    return; // No canonical URL; the caller renders the edit form in place.
  }

  redirect(
    buildDocumentEditPath({
      projectIdentifier: document.sourceProject.identifier,
      slug: document.slug,
      documentId: document.id,
    }),
  );
}

/**
 * `lang` was a language id in old links, and is a code in the fallback path
 * built for a document with no project, so accept either. Resolving it against
 * the language table rather than the document's existing versions matters: a
 * "start a translation" link names a language the document has no version in
 * yet, and that is exactly the link a translator follows first.
 */
async function resolveLanguage(opts: { lang?: string; versionId?: string }): Promise<LanguageRecord | null> {
  if (opts.lang) {
    return isUuid(opts.lang) ? getLanguageById(opts.lang) : getLanguageByCode(opts.lang);
  }
  if (opts.versionId) {
    const version = await getDocumentVersionById(opts.versionId);
    return version ? getLanguageById(version.languageId) : null;
  }
  return null;
}

type DocumentRecord = NonNullable<Awaited<ReturnType<typeof getDocumentById>>>;
type LanguageRecord = NonNullable<Awaited<ReturnType<typeof getLanguageById>>>;

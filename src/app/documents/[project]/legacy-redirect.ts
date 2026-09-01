import { getDocumentVersionById } from '@/domain/document-version/document-version.repository';
import { getDocumentById } from '@/domain/document/document.repository';
import { buildDocumentEditPath, buildDocumentPath } from '@/domain/document/document-url';
import { permanentRedirect } from 'next/navigation';
import { notFound } from 'next/navigation';

/**
 * The old URLs are still in Slack threads and mail, so they have to keep
 * working:
 *
 *   /documents/{documentId}/translate?lang={languageId}&version={versionId}
 *   /documents/{documentId}/review?version={versionId}
 *   /documents/{documentId}/edit
 *
 * Each resolves the ids and permanently redirects to the readable URL, so a
 * follower of an old link also ends up with the new one in their address bar.
 */
export async function redirectToCanonical(
  documentId: string,
  opts: { languageId?: string; versionId?: string; edit?: boolean } = {},
): Promise<never> {
  const document = await getDocumentById(documentId);

  if (!document) {
    notFound();
  }

  const ref = {
    projectIdentifier: document.sourceProject?.identifier,
    slug: document.slug,
    documentId: document.id,
  };

  if (opts.edit) {
    permanentRedirect(buildDocumentEditPath(ref));
  }

  // The language can arrive directly, or via the version the link named.
  let languageId = opts.languageId;
  if (!languageId && opts.versionId) {
    languageId = (await getDocumentVersionById(opts.versionId))?.languageId;
  }

  const languageCode = document.versions.find((v) => v.languageId === languageId)?.language.code;

  if (!languageCode) {
    notFound();
  }

  permanentRedirect(buildDocumentPath({ ...ref, languageCode }));
}

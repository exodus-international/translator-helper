import { getDocumentByProjectAndSlug } from '@/domain/document/document.repository';
import { getLanguageByCode } from '@/domain/language/language.repository';
import { getCurrentUser } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import { DocumentEditorPage } from '../../../_editors/editor-page';

/**
 * The one editor URL: /documents/{project}/{slug}/{lang}
 *
 * Which editor renders follows the version's status rather than the URL, so a
 * link shared while a document was being translated still opens correctly once
 * it has moved to review. That is why the verb is not in the path.
 */
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ project: string; slug: string; lang: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const { project, slug, lang } = await params;

  const [document, language] = await Promise.all([
    getDocumentByProjectAndSlug(project, slug),
    getLanguageByCode(lang),
  ]);

  if (!document || !language) {
    notFound();
  }

  return <DocumentEditorPage document={document} language={language} user={user} />;
}

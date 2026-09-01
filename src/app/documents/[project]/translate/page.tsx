import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { DocumentEditorPage } from '../../_editors/editor-page';
import { resolveLegacy } from '../legacy-redirect';

export default async function LegacyTranslatePage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ lang?: string; version?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const { project: documentId } = await params;
  const { lang, version } = await searchParams;

  // Redirects to the canonical URL, or returns the document when there is none
  // to redirect to (its project was deleted).
  const { document, language } = await resolveLegacy(documentId, { lang, versionId: version });

  return <DocumentEditorPage document={document} language={language} user={user} />;
}

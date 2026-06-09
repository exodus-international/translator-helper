import { getDocumentVersionById } from '@/domain/document-version/document-version.repository';
import { getDocumentById } from '@/domain/document/document.repository';
import { getSuggestionsByDocumentVersion } from '@/domain/suggestion/suggestion.repository';
import { getCanonicalEditorPath } from '@/lib/document-status';
import { getCurrentUser } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import ReviewClient from './page.client';

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { version: versionId } = await searchParams;

  if (!versionId) {
    notFound();
  }

  const document = await getDocumentById(id);
  const version = await getDocumentVersionById(versionId);

  if (!document || !version) {
    notFound();
  }

  // Route guard: /review is for PENDING_REVIEW / APPROVED / DEPLOYED only.
  // Send pre-review states to /translate.
  const canonical = getCanonicalEditorPath(id, version.status, { versionId: version.id });
  if (!canonical.startsWith(`/documents/${id}/review`)) {
    redirect(canonical);
  }

  // Get the source (English) version
  const sourceVersion = document.versions.find((v: any) => v.language.code === 'en');

  if (!sourceVersion) {
    throw new Error('Source English version not found');
  }

  // Load suggestions for the target version
  const suggestions = await getSuggestionsByDocumentVersion(version.id);

  return (
    <ReviewClient
      document={document}
      sourceVersion={sourceVersion}
      targetVersion={version}
      user={user}
      initialSuggestions={suggestions}
    />
  );
}

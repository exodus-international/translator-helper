import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getDocumentById } from '@/domain/document/document.repository';
import { getDocumentVersionById } from '@/domain/document-version/document-version.repository';
import { notFound } from 'next/navigation';
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

  // Get the source (English) version
  const sourceVersion = document.versions.find((v: any) => v.language.code === 'en');

  if (!sourceVersion) {
    throw new Error('Source English version not found');
  }

  return <ReviewClient document={document} sourceVersion={sourceVersion} targetVersion={version} user={user} />;
}

import { getDocumentById } from '@/domain/document/document.repository';
import { listSourceProjectsAction } from '@/domain/source-project/source-project.actions';
import { getCurrentUser } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import EditDocumentClient from '../../_editors/edit.client';
import { redirectToLegacyEdit } from '../legacy-redirect';

export default async function LegacyEditPage({ params }: { params: Promise<{ project: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/documents');
  }

  const { project: documentId } = await params;

  // Redirects unless the document has no project to build a canonical URL from.
  await redirectToLegacyEdit(documentId);

  const document = await getDocumentById(documentId);

  if (!document) {
    notFound();
  }

  const sourceVersion = document.versions.find((v: { language: { code: string } }) => v.language.code === 'en');
  const sourceProjects = await listSourceProjectsAction();

  return (
    <EditDocumentClient document={document} sourceVersion={sourceVersion || null} sourceProjects={sourceProjects} />
  );
}

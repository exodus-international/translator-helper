import { getDocumentById } from '@/domain/document/document.repository';
import { listSourceProjectsAction } from '@/domain/source-project/source-project.actions';
import { getCurrentUser } from '@/lib/session';
import { isDeployer } from '@/lib/permissions';
import { notFound, redirect } from 'next/navigation';
import EditDocumentClient from './page.client';

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!isDeployer(user)) {
    redirect('/documents');
  }

  const { id } = await params;
  const document = await getDocumentById(id);

  if (!document) {
    notFound();
  }

  // Get the source (English) version
  const sourceVersion = document.versions.find((v: any) => v.language.code === 'en');

  const sourceProjects = await listSourceProjectsAction();

  return (
    <EditDocumentClient document={document} sourceVersion={sourceVersion || null} sourceProjects={sourceProjects} />
  );
}

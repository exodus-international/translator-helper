import { getDocumentByProjectAndSlug } from '@/domain/document/document.repository';
import { listSourceProjectsAction } from '@/domain/source-project/source-project.actions';
import { getCurrentUser } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import EditDocumentClient from '../../../_editors/edit.client';

export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ project: string; slug: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/documents');
  }

  const { project, slug } = await params;
  const document = await getDocumentByProjectAndSlug(project, slug);

  if (!document) {
    notFound();
  }

  const sourceVersion = document.versions.find((v: { language: { code: string } }) => v.language.code === 'en');
  const sourceProjects = await listSourceProjectsAction();

  return (
    <EditDocumentClient document={document} sourceVersion={sourceVersion || null} sourceProjects={sourceProjects} />
  );
}
